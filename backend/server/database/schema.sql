-- QuantGem initial schema
-- Safe to run multiple times: uses IF NOT EXISTS where possible.

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT,
  full_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  subscription_start_date TIMESTAMP NULL,
  subscription_end_date TIMESTAMP NULL,
  trial_end_date TIMESTAMP NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  phone TEXT,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Usage limits (per user)
CREATE TABLE IF NOT EXISTS usage_limits (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  comparison_count INT NOT NULL DEFAULT 0,
  comparison_limit INT NOT NULL DEFAULT 3,
  alert_count INT NOT NULL DEFAULT 0,
  alert_limit INT NOT NULL DEFAULT 3,
  export_count INT NOT NULL DEFAULT 0,
  export_limit INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions(created_at);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  subscription_id BIGINT REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  payment_method TEXT,
  payment_gateway TEXT,
  merchant_trade_no TEXT UNIQUE,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP,
  gateway_response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Stock master symbols
CREATE TABLE IF NOT EXISTS stock_symbols (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  short_name TEXT,
  market TEXT,
  industry TEXT
);

-- Stock daily prices
CREATE TABLE IF NOT EXISTS stock_prices (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stock_symbols(symbol) ON DELETE CASCADE,
  date DATE NOT NULL,
  open_price NUMERIC,
  high_price NUMERIC,
  low_price NUMERIC,
  close_price NUMERIC,
  volume NUMERIC,
  change NUMERIC,
  change_percent NUMERIC,
  UNIQUE(symbol, date)
);
CREATE INDEX IF NOT EXISTS idx_stock_prices_date ON stock_prices(date);
CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol_date ON stock_prices(symbol, date DESC);

-- Returns table used by analytics endpoints
CREATE TABLE IF NOT EXISTS stock_returns (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES stock_symbols(symbol) ON DELETE CASCADE,
  date DATE NOT NULL,
  daily_return NUMERIC,
  weekly_return NUMERIC,
  monthly_return NUMERIC,
  quarterly_return NUMERIC,
  yearly_return NUMERIC,
  UNIQUE(symbol, date)
);
CREATE INDEX IF NOT EXISTS idx_stock_returns_date ON stock_returns(date);
CREATE INDEX IF NOT EXISTS idx_stock_returns_symbol_date ON stock_returns(symbol, date DESC);

-- Seed minimal data so the app can start without manual inserts (optional)
-- This seed will not override existing rows.
INSERT INTO stock_symbols(symbol, name, short_name, market, industry)
VALUES
  ('2330.TW', 'Taiwan Semiconductor Manufacturing Co Ltd', '台積電', 'TWSE', 'Semiconductors')
ON CONFLICT (symbol) DO NOTHING;
