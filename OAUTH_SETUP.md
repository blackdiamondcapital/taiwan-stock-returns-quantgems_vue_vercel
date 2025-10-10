# Google & Facebook OAuth 登入設定指南

## 📋 概述

本指南將幫助您完成 Google 和 Facebook OAuth 登入功能的設置。

## 🔧 安裝步驟

### 1. 安裝必要套件

```bash
cd server
npm install passport passport-google-oauth20 passport-facebook express-session
```

### 2. 執行資料庫遷移

OAuth 功能需要在資料庫中添加額外欄位來支援第三方登入。

```bash
# 執行 OAuth 支援遷移
psql -U postgres -d postgres -f server/database/migrations/add_oauth_support.sql
```

這將會：
- 將 `password_hash` 改為可選（OAuth 用戶不需要密碼）
- 添加 `auth_provider` 欄位（email, google, facebook）
- 添加 `provider_id` 欄位（OAuth 提供商的用戶 ID）
- 添加 `provider_data` 欄位（儲存額外的 OAuth 資料）

### 3. 驗證資料庫更改

```sql
-- 登入 PostgreSQL
psql -U postgres -d postgres

-- 查看 users 表結構
\d users

-- 應該看到新增的欄位：
-- auth_provider | character varying(50) | default 'email'
-- provider_id | character varying(255) |
-- provider_data | jsonb |
```

## 🔑 Google OAuth 設定

### 1. 創建 Google Cloud 專案

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 創建新專案或選擇現有專案
3. 專案名稱：`QuantGem` 或您喜歡的名稱

### 2. 啟用 Google+ API

1. 在左側選單選擇「API 和服務」>「程式庫」
2. 搜尋「Google+ API」
3. 點擊啟用

### 3. 創建 OAuth 2.0 憑證

1. 前往「API 和服務」>「憑證」
2. 點擊「建立憑證」>「OAuth 用戶端 ID」
3. 應用程式類型：選擇「網頁應用程式」
4. 名稱：`QuantGem Web Client`

**已授權的 JavaScript 來源：**
```
http://localhost:5173
http://localhost:3001
```

**已授權的重新導向 URI：**
```
http://localhost:3001/api/auth/google/callback
```

生產環境需要添加：
```
https://yourdomain.com
https://yourdomain.com/api/auth/google/callback
```

5. 點擊「建立」
6. 複製「用戶端 ID」和「用戶端密鑰」

### 4. 設定 OAuth 同意畫面

1. 前往「OAuth 同意畫面」
2. 選擇「外部」（測試階段可選擇「內部」）
3. 填寫應用程式資訊：
   - 應用程式名稱：`QuantGem`
   - 用戶支援電子郵件：您的 email
   - 應用程式標誌：（可選）
   - 授權網域：`localhost`（測試用）
4. 範圍：選擇 `email` 和 `profile`
5. 儲存並繼續

## 📘 Facebook OAuth 設定

### 1. 創建 Facebook 應用程式

1. 前往 [Facebook for Developers](https://developers.facebook.com/)
2. 點擊「我的應用程式」>「建立應用程式」
3. 選擇「消費者」作為應用程式類型
4. 填寫應用程式資訊：
   - 顯示名稱：`QuantGem`
   - 應用程式聯絡電子郵件：您的 email
5. 建立應用程式

### 2. 設定 Facebook 登入

1. 在應用程式儀表板，找到「Facebook 登入」產品
2. 點擊「設定」
3. 選擇「網站」平台

### 3. 配置有效的 OAuth 重新導向 URI

1. 前往「Facebook 登入」>「設定」
2. 在「有效的 OAuth 重新導向 URI」中添加：

```
http://localhost:3001/api/auth/facebook/callback
```

生產環境需要添加：
```
https://yourdomain.com/api/auth/facebook/callback
```

### 4. 獲取應用程式憑證

1. 前往「設定」>「基本資料」
2. 複製「應用程式編號」（App ID）
3. 複製「應用程式密鑰」（App Secret，需要點擊顯示）

## ⚙️ 環境變數配置

在專案根目錄的 `.env` 文件中添加以下配置：

```bash
# Google OAuth 配置
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Facebook OAuth 配置
FACEBOOK_APP_ID=your_facebook_app_id_here
FACEBOOK_APP_SECRET=your_facebook_app_secret_here
FACEBOOK_CALLBACK_URL=http://localhost:3001/api/auth/facebook/callback

# Session Secret (用於 Passport session)
SESSION_SECRET=quantgem-session-secret-change-in-production-2024
```

**⚠️ 重要提醒：**
- 請將 `your_google_client_id_here` 等替換為實際的憑證
- 生產環境務必更改 `SESSION_SECRET` 為隨機字串
- 不要將 `.env` 文件提交到版本控制系統

### 生成安全的 Session Secret

```bash
# 使用 Node.js 生成隨機密鑰
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 🚀 啟動應用程式

### 1. 啟動後端伺服器

```bash
cd server
npm run dev
```

伺服器應該運行在 `http://localhost:3001`

### 2. 啟動前端開發伺服器

```bash
# 在專案根目錄
npm run dev
```

前端應該運行在 `http://localhost:5173`

## ✅ 測試 OAuth 登入

### 1. 測試 Google 登入

1. 打開瀏覽器訪問 `http://localhost:5173`
2. 點擊「登入」按鈕
3. 點擊「使用 Google 登入」按鈕
4. 在彈出的 Google 登入視窗中選擇帳號
5. 授權應用程式訪問您的資料
6. 登入成功後應該重定向回首頁

### 2. 測試 Facebook 登入

1. 在登入模態框中點擊「使用 Facebook 登入」
2. 在 Facebook 登入視窗中輸入帳密
3. 授權應用程式
4. 登入成功

### 3. 驗證資料庫記錄

```sql
-- 查看 OAuth 用戶
SELECT 
  id, 
  email, 
  username, 
  auth_provider, 
  provider_id,
  created_at 
FROM users 
WHERE auth_provider IN ('google', 'facebook');

-- 查看審計日誌
SELECT 
  user_id, 
  action, 
  details,
  created_at 
FROM audit_logs 
WHERE action IN ('oauth_login', 'oauth_register')
ORDER BY created_at DESC;
```

## 🔍 API 端點說明

### Google OAuth 流程

```
GET /api/auth/google
```
- 啟動 Google OAuth 流程
- 重定向到 Google 登入頁面

```
GET /api/auth/google/callback
```
- Google OAuth 回調端點
- 處理 Google 返回的授權碼
- 創建或更新用戶
- 生成 JWT token
- 重定向到前端 `/auth/callback?token=xxx&provider=google`

### Facebook OAuth 流程

```
GET /api/auth/facebook
```
- 啟動 Facebook OAuth 流程
- 重定向到 Facebook 登入頁面

```
GET /api/auth/facebook/callback
```
- Facebook OAuth 回調端點
- 處理 Facebook 返回的授權碼
- 創建或更新用戶
- 生成 JWT token
- 重定向到前端 `/auth/callback?token=xxx&provider=facebook`

## 🔐 安全性最佳實踐

### 1. HTTPS 配置（生產環境必須）

生產環境必須使用 HTTPS：

```javascript
// server.js 中的 session 配置
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // 生產環境設為 true
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));
```

### 2. CORS 設定

```javascript
// 限制允許的來源
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
```

### 3. 憑證保護

- 使用環境變數儲存敏感資訊
- 不要在程式碼中硬編碼憑證
- 定期更換密鑰
- 使用密鑰管理服務（如 AWS Secrets Manager）

## 📊 資料庫結構說明

### users 表新增欄位

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| `auth_provider` | VARCHAR(50) | 認證提供商 | 'email', 'google', 'facebook' |
| `provider_id` | VARCHAR(255) | OAuth 提供商的用戶 ID | '123456789' |
| `provider_data` | JSONB | OAuth 提供商返回的額外數據 | JSON 格式 |

### 用戶登入邏輯

1. **首次 OAuth 登入：**
   - 檢查是否存在相同 `provider_id` 的用戶
   - 若不存在，檢查是否有相同 email 的用戶
   - 若 email 存在，連結 OAuth 到該帳號
   - 若完全不存在，創建新用戶

2. **後續 OAuth 登入：**
   - 通過 `auth_provider` 和 `provider_id` 查找用戶
   - 更新最後登入時間
   - 更新 OAuth 提供商資料

## 🐛 常見問題排解

### Q1: Redirect URI 不匹配

**錯誤訊息：** `redirect_uri_mismatch`

**解決方案：**
1. 檢查 Google/Facebook 控制台中的重定向 URI
2. 確保 `.env` 中的 `CALLBACK_URL` 與控制台設定完全一致
3. 注意 `http` vs `https`、結尾斜線等細節

### Q2: 無法獲取用戶 Email

**Facebook 特定問題：**
- 確保在 Facebook 應用程式設定中請求了 `email` 權限
- 某些 Facebook 用戶可能未提供 email

**解決方案：**
```javascript
// 在 Passport 策略中添加檢查
if (!profile.emails || !profile.emails[0]) {
  // 處理無 email 的情況
}
```

### Q3: Session 無法保持

**解決方案：**
1. 檢查 `SESSION_SECRET` 是否設定
2. 確認 cookie 設定正確
3. 開發環境使用 HTTP 時，`secure` 需設為 `false`

### Q4: 資料庫連接錯誤

**解決方案：**
1. 確認 PostgreSQL 正在運行
2. 檢查 `DATABASE_URL` 環境變數
3. 執行資料庫遷移檔案

## 📝 生產環境部署清單

- [ ] 更新 Google OAuth 重定向 URI 為生產域名
- [ ] 更新 Facebook OAuth 重定向 URI 為生產域名
- [ ] 設定 HTTPS
- [ ] 更改 `SESSION_SECRET` 為強隨機值
- [ ] 啟用 `cookie.secure = true`
- [ ] 設定 CORS 白名單
- [ ] 設定速率限制
- [ ] 啟用資料庫 SSL 連接
- [ ] 設定錯誤監控（如 Sentry）
- [ ] 配置日誌記錄
- [ ] 備份資料庫

## 🎉 完成！

如果所有步驟都正確執行，您應該能夠：

✅ 使用 Google 帳號登入/註冊  
✅ 使用 Facebook 帳號登入/註冊  
✅ OAuth 用戶自動創建帳號  
✅ 關聯現有 Email 帳號與 OAuth  
✅ 查看 OAuth 用戶資料  

## 📞 需要幫助？

如果遇到問題：

1. 檢查瀏覽器控制台的錯誤訊息
2. 查看伺服器終端的日誌輸出
3. 檢查資料庫連接狀態
4. 確認所有環境變數正確設置
5. 查看 Google/Facebook 開發者控制台的錯誤日誌

祝您開發順利！🚀
