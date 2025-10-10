import express from 'express';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import pkg from 'pg';

const { Pool } = pkg;
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ success: false, message: '未提供認證 Token' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token 已過期' });
    }
    return res.status(401).json({ success: false, message: 'Token 無效' });
  }
}

// Email transporter configuration
let emailTransporter = null;

// Batch notification system
const pendingNotifications = new Map(); // userId -> { alerts: [], timer: timeout }
const BATCH_INTERVALS = {
  'immediate': 0,           // 即時發送
  'batch_5min': 5 * 60 * 1000,   // 5分鐘批次
  'batch_15min': 15 * 60 * 1000, // 15分鐘批次
  'batch_1hour': 60 * 60 * 1000, // 1小時批次
  'daily': 24 * 60 * 60 * 1000   // 每日摘要
};

function initEmailTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
}

initEmailTransporter();

// Send batch email with multiple alerts
async function sendBatchEmail(userId, email, alerts) {
  if (!emailTransporter || !email) return;
  
  try {
    const alertsHtml = alerts.map(alert => `
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid ${alert.direction === '▲' ? '#10b981' : '#ef4444'};">
        <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: ${alert.direction === '▲' ? '#10b981' : '#ef4444'};">  
          ${alert.direction} ${alert.symbol} ${alert.name ? '- ' + alert.name : ''}
        </p>
        <p style="margin: 5px 0;"><strong>類型：</strong>${alert.type}</p>
        <p style="margin: 5px 0;"><strong>條件：</strong>${alert.condition}</p>
        <p style="margin: 5px 0;"><strong>當前值：</strong><span style="color: ${alert.direction === '▲' ? '#10b981' : '#ef4444'}; font-weight: bold;">${alert.message}</span></p>
        <p style="margin: 5px 0; color: #666; font-size: 12px;">觸發時間：${new Date(alert.timestamp).toLocaleString('zh-TW')}</p>
      </div>
    `).join('');

    await emailTransporter.sendMail({
      from: `"QuantGem 警示系統" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🔔 QuantGem 警示通知 (${alerts.length} 筆)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #00d4ff; border-bottom: 2px solid #00d4ff; padding-bottom: 10px;">
            📊 QuantGem 警示摘要
          </h2>
          <p style="color: #666; margin: 20px 0;">您有 <strong style="color: #00d4ff;">${alerts.length}</strong> 筆警示觸發：</p>
          ${alertsHtml}
          <hr style="border: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            此郵件由 QuantGem 警示系統自動發送<br>
            <a href="http://localhost:5173" style="color: #00d4ff; text-decoration: none;">前往控制台</a>
          </p>
        </div>
      `,
    });
    
    console.log(`Batch email sent to ${email} with ${alerts.length} alerts`);
  } catch (error) {
    console.error('Send batch email error:', error);
  }
}

// Send batch LINE notification
async function sendBatchLineNotification(token, alerts) {
  if (!token) return;
  
  try {
    const alertsText = alerts.map((alert, index) => 
      `${index + 1}. ${alert.direction} ${alert.symbol} ${alert.name || ''}\n   ${alert.type}: ${alert.message}`
    ).join('\n\n');
    
    const message = `🔔 QuantGem 警示通知\n\n共 ${alerts.length} 筆警示觸發：\n\n${alertsText}\n\n⏰ ${new Date().toLocaleString('zh-TW')}`;
    
    await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`,
      },
      body: new URLSearchParams({ message }),
    });
    
    console.log(`Batch LINE notification sent with ${alerts.length} alerts`);
  } catch (error) {
    console.error('Send batch LINE notification error:', error);
  }
}

// Process and send pending notifications for a user
async function processPendingNotifications(userId, settings) {
  const pending = pendingNotifications.get(userId);
  if (!pending || pending.alerts.length === 0) return;
  
  const alerts = [...pending.alerts];
  pendingNotifications.delete(userId);
  
  // Send batch email
  if (settings.notification_email_enabled && settings.notification_email) {
    await sendBatchEmail(userId, settings.notification_email, alerts);
  }
  
  // Send batch LINE notification
  if (settings.line_notify_enabled && settings.line_notify_token) {
    await sendBatchLineNotification(settings.line_notify_token, alerts);
  }
}

// Add alert to pending batch
function addToPendingBatch(userId, alertData, settings) {
  const interval = BATCH_INTERVALS[settings.notification_frequency || 'batch_5min'];
  
  if (interval === 0) {
    // Immediate mode - send right away
    return false; // Return false to indicate immediate sending
  }
  
  if (!pendingNotifications.has(userId)) {
    pendingNotifications.set(userId, {
      alerts: [],
      timer: null,
    });
  }
  
  const pending = pendingNotifications.get(userId);
  pending.alerts.push({
    ...alertData,
    timestamp: new Date().toISOString(),
  });
  
  // Clear existing timer
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  
  // Set new timer to send batch
  pending.timer = setTimeout(() => {
    processPendingNotifications(userId, settings);
  }, interval);
  
  return true; // Return true to indicate batched
}

// 獲取用戶通知設定
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        notification_email,
        notification_email_enabled,
        line_notify_token,
        line_notify_enabled,
        notification_frequency
      FROM users 
      WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '用戶不存在' });
    }

    const settings = result.rows[0];
    
    res.json({
      success: true,
      data: {
        email: settings.notification_email,
        emailEnabled: settings.notification_email_enabled || false,
        lineNotifyEnabled: settings.line_notify_enabled || false,
        hasLineToken: !!settings.line_notify_token,
        notificationFrequency: settings.notification_frequency || 'batch_5min',
      },
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ success: false, message: '獲取通知設定失敗' });
  }
});

// 更新 Email 通知設定
router.post('/email/update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, enabled, frequency } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: '請輸入有效的 Email' });
    }

    // Validate frequency if provided
    const validFrequencies = ['immediate', 'batch_5min', 'batch_15min', 'batch_1hour', 'daily'];
    const notificationFrequency = frequency && validFrequencies.includes(frequency) 
      ? frequency 
      : 'batch_5min';

    await pool.query(
      `UPDATE users 
      SET notification_email = $1, 
          notification_email_enabled = $2,
          notification_frequency = $3,
          updated_at = NOW()
      WHERE id = $4`,
      [email, enabled, notificationFrequency, userId]
    );

    res.json({
      success: true,
      message: 'Email 通知設定已更新',
    });
  } catch (error) {
    console.error('Update email settings error:', error);
    res.status(500).json({ success: false, message: '更新 Email 設定失敗' });
  }
});

// 測試 Email 發送
router.post('/email/test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT notification_email FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].notification_email) {
      return res.status(400).json({ success: false, message: '請先設定 Email' });
    }

    const email = result.rows[0].notification_email;
    
    if (!emailTransporter) {
      return res.status(500).json({ 
        success: false, 
        message: 'Email 服務未設定，請聯繫管理員' 
      });
    }

    await emailTransporter.sendMail({
      from: `"QuantGem 警示系統" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '🔔 QuantGem 測試通知',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00d4ff;">QuantGem 警示測試</h2>
          <p>這是一封測試郵件，確認您的 Email 通知功能正常運作。</p>
          <p style="color: #666; font-size: 14px;">如果您收到此郵件，表示 Email 通知已成功設定！</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">此郵件由 QuantGem 警示系統自動發送</p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: '測試郵件已發送，請檢查收件匣',
    });
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({ success: false, message: '發送測試郵件失敗：' + error.message });
  }
});

// 更新 LINE Notify 設定
router.post('/line/update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, enabled } = req.body;

    if (!token && !enabled) {
      await pool.query(
        `UPDATE users 
        SET line_notify_enabled = $1, updated_at = NOW()
        WHERE id = $2`,
        [false, userId]
      );

      return res.json({
        success: true,
        message: 'LINE Notify 已停用',
      });
    }

    if (!token && enabled) {
      return res.status(400).json({ success: false, message: '請輸入 LINE Notify Token' });
    }

    let tokenToSave = token;

    if (token && token !== 'existing') {
      // 驗證 token 是否有效
      const verifyResponse = await fetch('https://notify-api.line.me/api/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!verifyResponse.ok) {
        return res.status(400).json({ 
          success: false, 
          message: 'LINE Notify Token 無效，請重新申請' 
        });
      }
    } else if (token === 'existing') {
      const existing = await pool.query(
        'SELECT line_notify_token FROM users WHERE id = $1',
        [userId]
      );

      tokenToSave = existing.rows[0]?.line_notify_token || null;
      if (!tokenToSave) {
        return res.status(400).json({ success: false, message: '請輸入 LINE Notify Token' });
      }
    }

    await pool.query(
      `UPDATE users 
      SET line_notify_token = $1, 
          line_notify_enabled = $2,
          updated_at = NOW()
      WHERE id = $3`,
      [tokenToSave, enabled, userId]
    );

    res.json({
      success: true,
      message: 'LINE Notify 設定已更新',
    });
  } catch (error) {
    console.error('Update LINE settings error:', error);
    res.status(500).json({ success: false, message: '更新 LINE 設定失敗' });
  }
});

// 測試 LINE Notify 發送
router.post('/line/test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT line_notify_token FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].line_notify_token) {
      return res.status(400).json({ success: false, message: '請先設定 LINE Notify Token' });
    }

    const token = result.rows[0].line_notify_token;
    
    const response = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`,
      },
      body: new URLSearchParams({
        message: '\n🔔 QuantGem 測試通知\n\n這是一則測試訊息，確認您的 LINE 通知功能正常運作！\n\n✅ 設定成功',
      }),
    });

    if (!response.ok) {
      throw new Error('LINE Notify API 回應失敗');
    }

    res.json({
      success: true,
      message: '測試訊息已發送至 LINE',
    });
  } catch (error) {
    console.error('Send test LINE message error:', error);
    res.status(500).json({ success: false, message: '發送測試訊息失敗：' + error.message });
  }
});

// 發送警示通知（由警示系統呼叫）
router.post('/send-alert', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { alertData } = req.body;
    
    if (!alertData) {
      return res.status(400).json({ success: false, message: '缺少警示資料' });
    }

    const result = await pool.query(
      `SELECT 
        notification_email,
        notification_email_enabled,
        line_notify_token,
        line_notify_enabled,
        notification_frequency
      FROM users 
      WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '用戶不存在' });
    }

    const settings = result.rows[0];
    
    // Check if user has any notification enabled
    if (!settings.notification_email_enabled && !settings.line_notify_enabled) {
      return res.json({
        success: true,
        message: '通知功能未啟用',
        data: { batched: false }
      });
    }

    // Try to add to batch
    const batched = addToPendingBatch(userId, alertData, settings);
    
    if (!batched) {
      // Immediate mode - send right away
      const notifications = {
        email: false,
        line: false,
      };

      // Send Email notification immediately
      if (settings.notification_email_enabled && settings.notification_email && emailTransporter) {
        try {
          await emailTransporter.sendMail({
            from: `"QuantGem 警示系統" <${process.env.SMTP_USER}>`,
            to: settings.notification_email,
            subject: `🔔 ${alertData.title || '警示觸發'}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #00d4ff;">⚠️ ${alertData.title || '警示觸發'}</h2>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 10px 0;"><strong>股票代碼：</strong>${alertData.symbol || 'N/A'}</p>
                  <p style="margin: 10px 0;"><strong>股票名稱：</strong>${alertData.name || 'N/A'}</p>
                  <p style="margin: 10px 0;"><strong>警示類型：</strong>${alertData.type || 'N/A'}</p>
                  <p style="margin: 10px 0;"><strong>觸發條件：</strong>${alertData.condition || 'N/A'}</p>
                  <p style="margin: 10px 0; color: ${alertData.direction === '▲' ? '#10b981' : '#ef4444'}; font-size: 18px;">
                    <strong>${alertData.message || 'N/A'}</strong>
                  </p>
                  <p style="margin: 10px 0; color: #666; font-size: 14px;">觸發時間：${new Date().toLocaleString('zh-TW')}</p>
                </div>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">此郵件由 QuantGem 警示系統自動發送</p>
              </div>
            `,
          });
          notifications.email = true;
        } catch (error) {
          console.error('Send email notification error:', error);
        }
      }

      // Send LINE notification immediately
      if (settings.line_notify_enabled && settings.line_notify_token) {
        try {
          const lineMessage = `
🔔 QuantGem 警示觸發

📊 ${alertData.symbol || 'N/A'} ${alertData.name || ''}
📈 ${alertData.type || 'N/A'}
${alertData.direction || ''} ${alertData.message || ''}

⏰ ${new Date().toLocaleString('zh-TW')}
          `.trim();

          await fetch('https://notify-api.line.me/api/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Bearer ${settings.line_notify_token}`,
            },
            body: new URLSearchParams({
              message: lineMessage,
            }),
          });
          notifications.line = true;
        } catch (error) {
          console.error('Send LINE notification error:', error);
        }
      }

      return res.json({
        success: true,
        message: '通知已即時發送',
        data: { ...notifications, batched: false },
      });
    }
    
    // Batched mode
    const pending = pendingNotifications.get(userId);
    res.json({
      success: true,
      message: '警示已加入批次佇列',
      data: {
        batched: true,
        pendingCount: pending?.alerts.length || 0,
        frequency: settings.notification_frequency || 'batch_5min'
      },
    });
  } catch (error) {
    console.error('Send alert notification error:', error);
    res.status(500).json({ success: false, message: '發送通知失敗' });
  }
});

export default router;
