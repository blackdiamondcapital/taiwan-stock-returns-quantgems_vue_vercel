-- ===================================
-- OAuth 登入支援遷移
-- 執行: psql -U postgres -d postgres -f server/database/migrations/add_oauth_support.sql
-- ===================================

-- 1. 修改 password_hash 為可選（OAuth 用戶不需要密碼）
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. 添加 OAuth 提供商相關欄位
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_data JSONB;

-- 3. 創建複合唯一索引（確保同一提供商的用戶 ID 唯一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_id 
  ON users(auth_provider, provider_id) 
  WHERE provider_id IS NOT NULL;

-- 4. 添加註釋說明
COMMENT ON COLUMN users.auth_provider IS '認證提供商: email, google, facebook';
COMMENT ON COLUMN users.provider_id IS 'OAuth 提供商的用戶 ID';
COMMENT ON COLUMN users.provider_data IS 'OAuth 提供商返回的額外數據（JSON 格式）';

-- 5. 更新現有用戶的 auth_provider 為 'email'
UPDATE users SET auth_provider = 'email' WHERE auth_provider IS NULL;

-- 驗證修改
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('password_hash', 'auth_provider', 'provider_id', 'provider_data');
