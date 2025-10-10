import express from 'express';
import pkg from 'pg';
import ecpayService from '../services/ecpay.js';
import { requireAuth } from '../middleware/auth.js';

const { Pool } = pkg;
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/quantgem'
});

// ===================================
// 獲取訂閱方案列表
// ===================================
router.get('/plans', (req, res) => {
  try {
    const plans = Object.values(ecpayService.SUBSCRIPTION_PLANS);
    
    res.json({
      success: true,
      data: { plans }
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      message: '獲取方案失敗'
    });
  }
});

// ===================================
// 創建訂閱支付訂單
// ===================================
router.post('/subscribe', requireAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { plan } = req.body;
    const userId = req.user.id;
    
    // 驗證方案
    if (!ecpayService.SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({
        success: false,
        message: '無效的訂閱方案'
      });
    }
    
    const planConfig = ecpayService.SUBSCRIPTION_PLANS[plan];
    
    await client.query('BEGIN');
    
    // 查詢用戶資訊
    const userResult = await client.query(
      'SELECT id, email, username, plan FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: '用戶不存在'
      });
    }
    
    const user = userResult.rows[0];
    
    // 檢查是否已經是相同或更高方案
    const planLevels = { free: 0, pro: 1, enterprise: 2 };
    if (planLevels[user.plan] >= planLevels[plan]) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: '您已經擁有此方案或更高級別的方案'
      });
    }
    
    // 創建 ECPay 支付訂單
    const paymentData = ecpayService.createSubscriptionPayment({
      userId: user.id,
      userEmail: user.email,
      plan,
      itemName: `${planConfig.name} - 月費訂閱`,
    });
    
    // 創建訂閱記錄（pending 狀態）
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    
    const subscriptionResult = await client.query(
      `INSERT INTO subscriptions 
       (user_id, plan, status, amount, currency, start_date, end_date, auto_renew)
       VALUES ($1, $2, 'pending', $3, 'TWD', $4, $5, true)
       RETURNING id`,
      [userId, plan, planConfig.price, startDate, endDate]
    );
    
    const subscriptionId = subscriptionResult.rows[0].id;
    
    // 創建支付記錄
    await client.query(
      `INSERT INTO payments 
       (user_id, subscription_id, amount, currency, payment_method, payment_gateway, 
        merchant_trade_no, status)
       VALUES ($1, $2, $3, 'TWD', 'credit_card', 'ecpay', $4, 'pending')`,
      [userId, subscriptionId, planConfig.price, paymentData.tradeNo]
    );
    
    // 記錄審計日誌
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, 'create_subscription', 'subscription', $2, $3, $4)`,
      [userId, subscriptionId, req.ip, JSON.stringify({ plan, amount: planConfig.price })]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: '訂單創建成功',
      data: {
        paymentData,
        subscriptionId,
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subscribe error:', error);
    res.status(500).json({
      success: false,
      message: '創建訂閱失敗'
    });
  } finally {
    client.release();
  }
});

// ===================================
// ECPay 付款完成回調（用戶返回頁面）
// ===================================
router.post('/ecpay/return', async (req, res) => {
  try {
    console.log('ECPay return:', req.body);
    
    // 驗證並處理通知
    const result = ecpayService.processPaymentNotification(req.body);
    
    if (!result.isValid) {
      return res.status(400).send('Invalid notification');
    }
    
    // 重定向到前端頁面
    if (result.paymentStatus === 'completed') {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/success?trade_no=${result.tradeNo}`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/failed?trade_no=${result.tradeNo}`);
    }
    
  } catch (error) {
    console.error('ECPay return error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/error`);
  }
});

// ===================================
// ECPay 付款通知 Webhook
// ===================================
router.post('/ecpay/notify', async (req, res) => {
  const client = await pool.connect();
  
  try {
    console.log('ECPay notify:', req.body);
    
    // 驗證並處理通知
    const result = ecpayService.processPaymentNotification(req.body);
    
    if (!result.isValid) {
      console.error('Invalid ECPay notification');
      return res.send('0|Invalid');
    }
    
    await client.query('BEGIN');
    
    // 更新支付記錄
    const paymentResult = await client.query(
      `UPDATE payments 
       SET status = $1, 
           transaction_id = $2, 
           paid_at = $3,
           gateway_response = $4
       WHERE merchant_trade_no = $5
       RETURNING id, user_id, subscription_id`,
      [
        result.paymentStatus,
        result.ecpayTradeNo,
        result.paymentDate,
        JSON.stringify(req.body),
        result.tradeNo
      ]
    );
    
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.error('Payment not found:', result.tradeNo);
      return res.send('0|PaymentNotFound');
    }
    
    const payment = paymentResult.rows[0];
    
    if (result.paymentStatus === 'completed') {
      // 更新訂閱狀態
      if (payment.subscription_id) {
        await client.query(
          `UPDATE subscriptions 
           SET status = 'active'
           WHERE id = $1`,
          [payment.subscription_id]
        );
        
        // 查詢訂閱詳情
        const subscriptionResult = await client.query(
          'SELECT plan, end_date FROM subscriptions WHERE id = $1',
          [payment.subscription_id]
        );
        
        if (subscriptionResult.rows.length > 0) {
          const subscription = subscriptionResult.rows[0];
          
          // 更新用戶方案
          await client.query(
            `UPDATE users 
             SET plan = $1, 
                 subscription_status = 'active',
                 subscription_start_date = NOW(),
                 subscription_end_date = $2
             WHERE id = $3`,
            [subscription.plan, subscription.end_date, payment.user_id]
          );
        }
      }
      
      // 記錄審計日誌
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
         VALUES ($1, 'payment_completed', 'payment', $2, $3, $4)`,
        [payment.user_id, payment.id, req.ip, JSON.stringify({ tradeNo: result.tradeNo, amount: result.amount })]
      );
    } else {
      // 支付失敗，更新訂閱狀態
      if (payment.subscription_id) {
        await client.query(
          `UPDATE subscriptions SET status = 'cancelled' WHERE id = $1`,
          [payment.subscription_id]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // 回應 ECPay（必須回傳 1|OK）
    res.send('1|OK');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ECPay notify error:', error);
    res.send('0|Error');
  } finally {
    client.release();
  }
});

// ===================================
// 取消訂閱
// ===================================
router.post('/cancel-subscription', requireAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user.id;
    const { reason } = req.body;
    
    await client.query('BEGIN');
    
    // 查詢當前訂閱
    const subscriptionResult = await client.query(
      `SELECT id, plan, status, end_date 
       FROM subscriptions 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (subscriptionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: '沒有找到活躍的訂閱'
      });
    }
    
    const subscription = subscriptionResult.rows[0];
    
    // 更新訂閱狀態（不立即取消，等到期後才降級）
    await client.query(
      `UPDATE subscriptions 
       SET auto_renew = false,
           cancelled_at = NOW(),
           cancel_reason = $1
       WHERE id = $2`,
      [reason, subscription.id]
    );
    
    // 記錄審計日誌
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, 'cancel_subscription', 'subscription', $2, $3, $4)`,
      [userId, subscription.id, req.ip, JSON.stringify({ reason })]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: '訂閱已取消，將在到期後停止',
      data: {
        endDate: subscription.end_date
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: '取消訂閱失敗'
    });
  } finally {
    client.release();
  }
});

// ===================================
// 重新啟用訂閱
// ===================================
router.post('/reactivate-subscription', requireAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user.id;
    
    await client.query('BEGIN');
    
    // 查詢最近的訂閱
    const subscriptionResult = await client.query(
      `SELECT id, status, auto_renew, end_date 
       FROM subscriptions 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (subscriptionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: '沒有找到可重新啟用的訂閱'
      });
    }
    
    const subscription = subscriptionResult.rows[0];
    
    if (subscription.auto_renew) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: '訂閱已經是啟用狀態'
      });
    }
    
    // 重新啟用自動續訂
    await client.query(
      `UPDATE subscriptions 
       SET auto_renew = true,
           cancelled_at = NULL
       WHERE id = $1`,
      [subscription.id]
    );
    
    // 記錄審計日誌
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, 'reactivate_subscription', 'subscription', $2, $3)`,
      [userId, subscription.id, req.ip]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: '訂閱已重新啟用'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reactivate subscription error:', error);
    res.status(500).json({
      success: false,
      message: '重新啟用失敗'
    });
  } finally {
    client.release();
  }
});

// ===================================
// 獲取訂閱歷史
// ===================================
router.get('/subscription-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, plan, status, amount, currency, start_date, end_date, 
              auto_renew, cancelled_at, created_at
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      data: { subscriptions: result.rows }
    });
    
  } catch (error) {
    console.error('Get subscription history error:', error);
    res.status(500).json({
      success: false,
      message: '獲取訂閱歷史失敗'
    });
  }
});

// ===================================
// 獲取支付歷史
// ===================================
router.get('/payment-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT p.id, p.amount, p.currency, p.payment_method, p.payment_gateway,
              p.transaction_id, p.status, p.paid_at, p.created_at,
              s.plan
       FROM payments p
       LEFT JOIN subscriptions s ON p.subscription_id = s.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      data: { payments: result.rows }
    });
    
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: '獲取支付歷史失敗'
    });
  }
});

export default router;
