-- Add notification fields to users table

-- Add email notification fields
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS notification_email_enabled BOOLEAN DEFAULT false;

-- Add LINE Notify fields
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS line_notify_token TEXT,
ADD COLUMN IF NOT EXISTS line_notify_enabled BOOLEAN DEFAULT false;

-- Add updated_at if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_notification_email ON users(notification_email);

COMMENT ON COLUMN users.notification_email IS 'Email address for alert notifications';
COMMENT ON COLUMN users.notification_email_enabled IS 'Whether email notifications are enabled';
COMMENT ON COLUMN users.line_notify_token IS 'LINE Notify access token';
COMMENT ON COLUMN users.line_notify_enabled IS 'Whether LINE notifications are enabled';
