-- ===================================
-- 用戶認證系統資料庫架構
-- ===================================

-- 用戶表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(100),
  full_name VARCHAR(255),
  
  -- 訂閱相關
  plan VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50) DEFAULT 'inactive',
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,
  trial_used BOOLEAN DEFAULT false,
  trial_end_date TIMESTAMP,
  
  -- 帳戶狀態
  email_verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  
  -- 個人資料
  avatar_url TEXT,
  phone VARCHAR(50),
  
  -- 時間戳記
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 訂閱記錄表
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL, -- active, cancelled, expired, pending
  
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'TWD',
  
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  next_billing_date TIMESTAMP,
  
  auto_renew BOOLEAN DEFAULT true,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 支付記錄表
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'TWD',
  
  payment_method VARCHAR(50), -- credit_card, atm, cvs, etc.
  payment_gateway VARCHAR(50), -- ecpay, newebpay, stripe, etc.
  
  transaction_id VARCHAR(255) UNIQUE,
  merchant_trade_no VARCHAR(255),
  
  status VARCHAR(50) NOT NULL, -- pending, completed, failed, refunded
  
  paid_at TIMESTAMP,
  refunded_at TIMESTAMP,
  
  -- 金流回傳資訊
  gateway_response JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 優惠券表
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  
  discount_type VARCHAR(20) NOT NULL, -- percentage, fixed
  discount_value DECIMAL(10, 2) NOT NULL,
  
  valid_from TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP,
  
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  
  applicable_plans TEXT[], -- 適用方案
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 優惠券使用記錄
CREATE TABLE IF NOT EXISTS coupon_usage (
  id SERIAL PRIMARY KEY,
  coupon_id INTEGER REFERENCES coupons(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  
  discount_amount DECIMAL(10, 2),
  
  used_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(coupon_id, user_id)
);

-- 推薦記錄表
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  referred_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  
  referral_code VARCHAR(50) NOT NULL,
  
  reward_type VARCHAR(50), -- free_month, discount, credits
  reward_value DECIMAL(10, 2),
  reward_granted BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(referrer_id, referred_id)
);

-- 使用限額追蹤表（免費用戶限制）
CREATE TABLE IF NOT EXISTS usage_limits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  
  -- 比較工具
  comparison_count INTEGER DEFAULT 0,
  comparison_limit INTEGER DEFAULT 3,
  
  -- 警示規則
  alert_count INTEGER DEFAULT 0,
  alert_limit INTEGER DEFAULT 3,
  
  -- 資料匯出
  export_count INTEGER DEFAULT 0,
  export_limit INTEGER DEFAULT 0,
  
  -- 重置時間
  reset_at TIMESTAMP DEFAULT NOW(),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- 審計日誌表
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  action VARCHAR(100) NOT NULL, -- login, register, purchase, cancel_subscription
  entity_type VARCHAR(50), -- user, subscription, payment
  entity_id INTEGER,
  
  ip_address INET,
  user_agent TEXT,
  
  details JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引優化
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_usage_limits_user_id ON usage_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- 自動更新 updated_at 觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_limits_updated_at BEFORE UPDATE ON usage_limits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
