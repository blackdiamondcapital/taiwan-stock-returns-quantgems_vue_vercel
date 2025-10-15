import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import passport from '../config/passport.js';
import { pool } from '../pool.js';

const router = express.Router();

// JWT 密鑰（生產環境應使用環境變數）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// ===================================
// 工具函數
// ===================================

// 生成 JWT Token
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      plan: user.plan,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// 驗證 Email 格式
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ===================================
// 註冊
// ===================================
router.post('/register', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { email, password, username, full_name } = req.body;
    
    // 驗證必填欄位
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '請提供 Email 和密碼'
      });
    }
    
    // 驗證 Email 格式
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email 格式不正確'
      });
    }
    
    // 驗證密碼長度
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密碼至少需要 6 個字元'
      });
    }
    
    await client.query('BEGIN');
    
    // 檢查 Email 是否已存在
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: '此 Email 已被註冊'
      });
    }
    
    // 加密密碼
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // 建立用戶
    const result = await client.query(
      `INSERT INTO users (email, password_hash, username, full_name, plan, subscription_status)
       VALUES ($1, $2, $3, $4, 'free', 'inactive')
       RETURNING id, email, username, full_name, plan, subscription_status, created_at`,
      [email.toLowerCase(), passwordHash, username || null, full_name || null]
    );
    
    const user = result.rows[0];
    
    // 初始化使用限額
    await client.query(
      `INSERT INTO usage_limits (user_id, comparison_limit, alert_limit, export_limit)
       VALUES ($1, 3, 3, 0)`,
      [user.id]
    );
    
    // 記錄審計日誌
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, 'register', 'user', $1, $2, $3)`,
      [user.id, req.ip, JSON.stringify({ method: 'email' })]
    );
    
    await client.query('COMMIT');
    
    // 生成 Token
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      message: '註冊成功',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          plan: user.plan,
          subscription_status: user.subscription_status,
          created_at: user.created_at,
        }
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: '註冊失敗，請稍後再試'
    });
  } finally {
    client.release();
  }
});

// ===================================
// 登入
// ===================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // 驗證必填欄位
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '請提供 Email 和密碼'
      });
    }
    
    // 查詢用戶
    const result = await pool.query(
      `SELECT id, email, password_hash, username, full_name, plan, subscription_status, 
              subscription_end_date, is_active
       FROM users 
       WHERE email = $1`,
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email 或密碼錯誤'
      });
    }
    
    const user = result.rows[0];
    
    // 檢查帳戶是否啟用
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: '帳戶已被停用'
      });
    }
    
    // 驗證密碼
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Email 或密碼錯誤'
      });
    }
    
    // 更新最後登入時間
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );
    
    // 記錄審計日誌
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES ($1, 'login', 'user', $1, $2, $3)`,
      [user.id, req.ip, req.get('user-agent')]
    );
    
    // 生成 Token
    const token = generateToken(user);
    
    // 移除密碼hash
    delete user.password_hash;
    
    res.json({
      success: true,
      message: '登入成功',
      data: {
        token,
        user
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '登入失敗，請稍後再試'
    });
  }
});

// ===================================
// 驗證 Token（取得當前用戶資訊）
// ===================================
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供認證 Token'
      });
    }
    
    // 驗證 Token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 查詢用戶資訊
    const result = await pool.query(
      `SELECT id, email, username, full_name, avatar_url, phone,
              plan, subscription_status, subscription_end_date, trial_end_date,
              email_verified, is_active, last_login_at, created_at
       FROM users 
       WHERE id = $1 AND is_active = true`,
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用戶不存在'
      });
    }
    
    const user = result.rows[0];
    
    // 查詢使用限額
    const limitsResult = await pool.query(
      `SELECT comparison_count, comparison_limit, alert_count, alert_limit,
              export_count, export_limit, reset_at
       FROM usage_limits 
       WHERE user_id = $1`,
      [user.id]
    );
    
    user.usage_limits = limitsResult.rows[0] || null;
    
    res.json({
      success: true,
      data: { user }
    });
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token 無效'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token 已過期'
      });
    }
    
    console.error('Auth me error:', error);
    res.status(500).json({
      success: false,
      message: '驗證失敗'
    });
  }
});

// ===================================
// 登出（前端刪除 Token 即可，這裡記錄日誌）
// ===================================
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // 記錄審計日誌
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
         VALUES ($1, 'logout', 'user', $1, $2)`,
        [decoded.id, req.ip]
      );
    }
    
    res.json({
      success: true,
      message: '登出成功'
    });
    
  } catch (error) {
    // 即使錯誤也返回成功（前端已刪除 Token）
    res.json({
      success: true,
      message: '登出成功'
    });
  }
});

// ===================================
// 更新用戶資料
// ===================================
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供認證 Token'
      });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const { username, full_name, phone, avatar_url } = req.body;
    
    const result = await pool.query(
      `UPDATE users 
       SET username = COALESCE($1, username),
           full_name = COALESCE($2, full_name),
           phone = COALESCE($3, phone),
           avatar_url = COALESCE($4, avatar_url)
       WHERE id = $5
       RETURNING id, email, username, full_name, phone, avatar_url, plan`,
      [username, full_name, phone, avatar_url, decoded.id]
    );
    
    res.json({
      success: true,
      message: '資料更新成功',
      data: { user: result.rows[0] }
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: '更新失敗'
    });
  }
});

// ===================================
// 修改密碼
// ===================================
router.put('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供認證 Token'
      });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: '請提供當前密碼和新密碼'
      });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密碼至少需要 6 個字元'
      });
    }
    
    // 查詢用戶
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用戶不存在'
      });
    }
    
    // 驗證當前密碼
    const isValidPassword = await bcrypt.compare(
      current_password,
      userResult.rows[0].password_hash
    );
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '當前密碼錯誤'
      });
    }
    
    // 加密新密碼
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(new_password, salt);
    
    // 更新密碼
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, decoded.id]
    );
    
    // 記錄審計日誌
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, 'change_password', 'user', $1, $2)`,
      [decoded.id, req.ip]
    );
    
    res.json({
      success: true,
      message: '密碼修改成功'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: '密碼修改失敗'
    });
  }
});

// ===================================
// Google OAuth 登入
// ===================================

// 啟動 Google OAuth 流程
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Google OAuth 回調
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_auth_failed`,
    session: false 
  }),
  (req, res) => {
    try {
      // 生成 JWT Token
      const token = generateToken(req.user);
      
      // 重定向到前端，並帶上 token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}&provider=google`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=token_generation_failed`);
    }
  }
);

// ===================================
// Facebook OAuth 登入
// ===================================

// 啟動 Facebook OAuth 流程
router.get('/facebook',
  passport.authenticate('facebook', {
    scope: ['email', 'public_profile']
  })
);

// Facebook OAuth 回調
router.get('/facebook/callback',
  passport.authenticate('facebook', { 
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=facebook_auth_failed`,
    session: false 
  }),
  (req, res) => {
    try {
      // 生成 JWT Token
      const token = generateToken(req.user);
      
      // 重定向到前端，並帶上 token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}&provider=facebook`);
    } catch (error) {
      console.error('Facebook callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=token_generation_failed`);
    }
  }
);

export default router;
