import jwt from 'jsonwebtoken';
import pkg from 'pg';
const { Pool } = pkg;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/quantgem'
});

// ===================================
// 驗證JWT Token中間件
// ===================================
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '請先登入'
      });
    }
    
    // 驗證 Token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 查詢用戶是否仍存在且啟用
    const result = await pool.query(
      'SELECT id, email, plan, subscription_status, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        message: '無效的認證'
      });
    }
    
    // 將用戶資訊附加到 request 物件
    req.user = result.rows[0];
    next();
    
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
        message: 'Token 已過期，請重新登入'
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: '認證失敗'
    });
  }
}

// ===================================
// 檢查訂閱狀態中間件
// ===================================
function requirePlan(...allowedPlans) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '請先登入'
      });
    }
    
    if (!allowedPlans.includes(req.user.plan)) {
      return res.status(403).json({
        success: false,
        message: '此功能需要升級訂閱方案',
        data: {
          current_plan: req.user.plan,
          required_plans: allowedPlans
        }
      });
    }
    
    next();
  };
}

// ===================================
// 檢查使用限額中間件
// ===================================
async function checkUsageLimit(limitType) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '請先登入'
        });
      }
      
      // Pro 以上用戶不受限制
      if (req.user.plan !== 'free') {
        return next();
      }
      
      // 查詢使用限額
      const result = await pool.query(
        `SELECT ${limitType}_count, ${limitType}_limit, reset_at
         FROM usage_limits
         WHERE user_id = $1`,
        [req.user.id]
      );
      
      if (result.rows.length === 0) {
        // 初始化限額記錄
        await pool.query(
          `INSERT INTO usage_limits (user_id, comparison_limit, alert_limit, export_limit)
           VALUES ($1, 3, 3, 0)
           ON CONFLICT (user_id) DO NOTHING`,
          [req.user.id]
        );
        return next();
      }
      
      const usage = result.rows[0];
      const countField = `${limitType}_count`;
      const limitField = `${limitType}_limit`;
      
      // 檢查是否需要重置（每天重置）
      const now = new Date();
      const resetAt = new Date(usage.reset_at);
      
      if (now - resetAt > 24 * 60 * 60 * 1000) {
        // 重置計數
        await pool.query(
          `UPDATE usage_limits
           SET ${limitType}_count = 0, reset_at = NOW()
           WHERE user_id = $1`,
          [req.user.id]
        );
        return next();
      }
      
      // 檢查是否超過限額
      if (usage[countField] >= usage[limitField]) {
        return res.status(429).json({
          success: false,
          message: `已達到每日使用限制（${usage[limitField]} 次），請升級至 Pro 方案`,
          data: {
            current_count: usage[countField],
            limit: usage[limitField],
            reset_at: usage.reset_at
          }
        });
      }
      
      next();
      
    } catch (error) {
      console.error('Check usage limit error:', error);
      res.status(500).json({
        success: false,
        message: '檢查使用限額失敗'
      });
    }
  };
}

// ===================================
// 增加使用次數
// ===================================
async function incrementUsage(userId, limitType) {
  try {
    await pool.query(
      `UPDATE usage_limits
       SET ${limitType}_count = ${limitType}_count + 1
       WHERE user_id = $1`,
      [userId]
    );
  } catch (error) {
    console.error('Increment usage error:', error);
  }
}

// ===================================
// 可選認證（有 Token 就驗證，沒有也放行）
// ===================================
async function optionalAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const result = await pool.query(
      'SELECT id, email, plan, subscription_status, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (result.rows.length > 0 && result.rows[0].is_active) {
      req.user = result.rows[0];
    } else {
      req.user = null;
    }
    
    next();
    
  } catch (error) {
    req.user = null;
    next();
  }
}

export {
  requireAuth,
  requirePlan,
  checkUsageLimit,
  incrementUsage,
  optionalAuth
};
