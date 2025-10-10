-- Add notification frequency preference to users table

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS notification_frequency VARCHAR(20) DEFAULT 'batch_5min';

COMMENT ON COLUMN users.notification_frequency IS 'Notification frequency: immediate, batch_5min, batch_15min, batch_1hour, daily';

-- Update existing users to use 5-minute batch by default
UPDATE users 
SET notification_frequency = 'batch_5min' 
WHERE notification_frequency IS NULL;
