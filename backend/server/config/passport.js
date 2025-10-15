import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { pool } from '../pool.js';

// ===================================
// Passport 序列化與反序列化
// ===================================

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

// ===================================
// Google OAuth 策略
// ===================================

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const client = await pool.connect();
          
          try {
            await client.query('BEGIN');
            
            // 檢查用戶是否已存在（通過 Google ID）
            let userResult = await client.query(
              'SELECT * FROM users WHERE auth_provider = $1 AND provider_id = $2',
              ['google', profile.id]
            );
            
            let user;
            
            if (userResult.rows.length > 0) {
              // 用戶已存在，更新最後登入時間和資料
              user = userResult.rows[0];
              
              await client.query(
                `UPDATE users 
                 SET last_login_at = NOW(),
                     provider_data = $1,
                     avatar_url = COALESCE(avatar_url, $2),
                     email_verified = true
                 WHERE id = $3`,
                [
                  JSON.stringify(profile._json),
                  profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                  user.id
                ]
              );
              
            } else {
              // 檢查是否有相同 Email 的用戶（可能之前用 Email 註冊過）
              const emailResult = await client.query(
                'SELECT * FROM users WHERE email = $1',
                [profile.emails && profile.emails[0] ? profile.emails[0].value : null]
              );
              
              if (emailResult.rows.length > 0) {
                // Email 已存在，將該帳號連結到 Google
                user = emailResult.rows[0];
                
                await client.query(
                  `UPDATE users 
                   SET auth_provider = $1,
                       provider_id = $2,
                       provider_data = $3,
                       avatar_url = COALESCE(avatar_url, $4),
                       email_verified = true,
                       last_login_at = NOW()
                   WHERE id = $5`,
                  [
                    'google',
                    profile.id,
                    JSON.stringify(profile._json),
                    profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                    user.id
                  ]
                );
                
              } else {
                // 創建新用戶
                const insertResult = await client.query(
                  `INSERT INTO users (
                    email, 
                    username, 
                    full_name, 
                    auth_provider, 
                    provider_id, 
                    provider_data,
                    avatar_url,
                    email_verified,
                    plan,
                    subscription_status
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'free', 'inactive')
                  RETURNING *`,
                  [
                    profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                    profile.displayName || null,
                    profile.displayName || null,
                    'google',
                    profile.id,
                    JSON.stringify(profile._json),
                    profile.photos && profile.photos[0] ? profile.photos[0].value : null
                  ]
                );
                
                user = insertResult.rows[0];
                
                // 初始化使用限額
                await client.query(
                  `INSERT INTO usage_limits (user_id, comparison_limit, alert_limit, export_limit)
                   VALUES ($1, 3, 3, 0)`,
                  [user.id]
                );
              }
            }
            
            // 記錄審計日誌
            await client.query(
              `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
               VALUES ($1, $2, 'user', $1, $3)`,
              [
                user.id,
                userResult.rows.length > 0 ? 'oauth_login' : 'oauth_register',
                JSON.stringify({ provider: 'google', profile_id: profile.id })
              ]
            );
            
            await client.query('COMMIT');
            
            return done(null, user);
            
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
          
        } catch (error) {
          console.error('Google OAuth error:', error);
          return done(error, null);
        }
      }
    )
  );
}

// ===================================
// Facebook OAuth 策略
// ===================================

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3001/api/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'emails', 'photos', 'name'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const client = await pool.connect();
          
          try {
            await client.query('BEGIN');
            
            // 檢查用戶是否已存在（通過 Facebook ID）
            let userResult = await client.query(
              'SELECT * FROM users WHERE auth_provider = $1 AND provider_id = $2',
              ['facebook', profile.id]
            );
            
            let user;
            
            if (userResult.rows.length > 0) {
              // 用戶已存在，更新最後登入時間和資料
              user = userResult.rows[0];
              
              await client.query(
                `UPDATE users 
                 SET last_login_at = NOW(),
                     provider_data = $1,
                     avatar_url = COALESCE(avatar_url, $2)
                 WHERE id = $3`,
                [
                  JSON.stringify(profile._json),
                  profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                  user.id
                ]
              );
              
            } else {
              // 檢查是否有相同 Email 的用戶
              const emailResult = await client.query(
                'SELECT * FROM users WHERE email = $1',
                [profile.emails && profile.emails[0] ? profile.emails[0].value : null]
              );
              
              if (emailResult.rows.length > 0) {
                // Email 已存在，將該帳號連結到 Facebook
                user = emailResult.rows[0];
                
                await client.query(
                  `UPDATE users 
                   SET auth_provider = $1,
                       provider_id = $2,
                       provider_data = $3,
                       avatar_url = COALESCE(avatar_url, $4),
                       last_login_at = NOW()
                   WHERE id = $5`,
                  [
                    'facebook',
                    profile.id,
                    JSON.stringify(profile._json),
                    profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                    user.id
                  ]
                );
                
              } else {
                // 創建新用戶
                const insertResult = await client.query(
                  `INSERT INTO users (
                    email, 
                    username, 
                    full_name, 
                    auth_provider, 
                    provider_id, 
                    provider_data,
                    avatar_url,
                    email_verified,
                    plan,
                    subscription_status
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'free', 'inactive')
                  RETURNING *`,
                  [
                    profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                    profile.displayName || null,
                    profile.displayName || null,
                    'facebook',
                    profile.id,
                    JSON.stringify(profile._json),
                    profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                    profile.emails && profile.emails[0] ? true : false
                  ]
                );
                
                user = insertResult.rows[0];
                
                // 初始化使用限額
                await client.query(
                  `INSERT INTO usage_limits (user_id, comparison_limit, alert_limit, export_limit)
                   VALUES ($1, 3, 3, 0)`,
                  [user.id]
                );
              }
            }
            
            // 記錄審計日誌
            await client.query(
              `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
               VALUES ($1, $2, 'user', $1, $3)`,
              [
                user.id,
                userResult.rows.length > 0 ? 'oauth_login' : 'oauth_register',
                JSON.stringify({ provider: 'facebook', profile_id: profile.id })
              ]
            );
            
            await client.query('COMMIT');
            
            return done(null, user);
            
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
          
        } catch (error) {
          console.error('Facebook OAuth error:', error);
          return done(error, null);
        }
      }
    )
  );
}

export default passport;
