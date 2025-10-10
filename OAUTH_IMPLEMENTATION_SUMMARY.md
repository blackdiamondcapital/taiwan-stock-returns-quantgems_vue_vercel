# Google & Facebook OAuth 實作總覽 📊

## ✅ 已完成的修改

### 1️⃣ 後端修改

#### 📦 套件依賴 (`server/package.json`)
新增套件：
- `passport@^0.7.0` - 認證中介軟體框架
- `passport-google-oauth20@^2.0.0` - Google OAuth 2.0 策略
- `passport-facebook@^3.0.0` - Facebook OAuth 策略
- `express-session@^1.17.3` - Session 管理

#### 🗄️ 資料庫遷移 (`server/database/migrations/add_oauth_support.sql`)
新增欄位到 `users` 表：
- `auth_provider` VARCHAR(50) - 認證提供商 (email/google/facebook)
- `provider_id` VARCHAR(255) - OAuth 提供商的用戶 ID
- `provider_data` JSONB - OAuth 提供商返回的額外數據

特性：
- `password_hash` 改為可選（OAuth 用戶不需要密碼）
- 複合唯一索引確保同一提供商的用戶 ID 唯一

#### ⚙️ Passport 配置 (`server/config/passport.js`)
新檔案，包含：
- Passport 序列化/反序列化邏輯
- Google OAuth 策略配置
- Facebook OAuth 策略配置
- 自動創建/更新用戶邏輯
- Email 關聯功能（連結現有帳號）

#### 🛣️ 認證路由 (`server/routes/auth.js`)
新增端點：
- `GET /api/auth/google` - 啟動 Google OAuth 流程
- `GET /api/auth/google/callback` - Google OAuth 回調
- `GET /api/auth/facebook` - 啟動 Facebook OAuth 流程
- `GET /api/auth/facebook/callback` - Facebook OAuth 回調

#### 🖥️ 伺服器配置 (`server/server.js`)
新增：
- Express Session 中介軟體
- Passport 初始化
- Passport Session 支援

#### 🔐 環境變數 (`.env`)
新增配置：
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your_facebook_app_id_here
FACEBOOK_APP_SECRET=your_facebook_app_secret_here
FACEBOOK_CALLBACK_URL=http://localhost:3001/api/auth/facebook/callback

# Session Secret
SESSION_SECRET=quantgem-session-secret-change-in-production-2024
```

### 2️⃣ 前端修改

#### 🎨 登入模態框 (`src/components/Auth/LoginModal.vue`)
新增：
- Google 登入按鈕（含 SVG 圖標）
- Facebook 登入按鈕（含 SVG 圖標）
- OAuth 登入函數
- 分隔線樣式
- Hover 效果和動畫

#### 📝 註冊模態框 (`src/components/Auth/RegisterModal.vue`)
新增：
- Google 註冊按鈕
- Facebook 註冊按鈕
- OAuth 註冊函數
- 相同的 UI 樣式

#### 🔄 OAuth 回調頁面 (`src/components/Auth/OAuthCallback.vue`)
新組件，處理：
- OAuth 回調後的 Token 接收
- Loading 狀態顯示
- 成功/錯誤狀態顯示
- 自動跳轉到首頁
- 錯誤訊息處理

#### 💾 Auth Store (`src/stores/auth.js`)
新增方法：
- `setToken` - 供 OAuth 回調使用
- `saveUser` - 直接儲存用戶資訊

### 3️⃣ 文檔

#### 📘 詳細設定指南 (`OAUTH_SETUP.md`)
包含：
- Google Cloud Console 完整設定步驟
- Facebook Developer 完整設定步驟
- 環境變數詳細說明
- API 端點文檔
- 安全性最佳實踐
- 常見問題排解
- 生產環境部署清單

#### ⚡ 快速開始指南 (`OAUTH_QUICKSTART.md`)
包含：
- 6 步驟快速設定
- 檢查清單
- 常見問題速查
- 測試步驟

## 📋 下一步操作

### 🔴 必須完成（才能使用 OAuth）

1. **安裝依賴套件**
   ```bash
   cd server
   npm install
   ```

2. **執行資料庫遷移**
   ```bash
   psql -U postgres -d postgres -f server/database/migrations/add_oauth_support.sql
   ```

3. **獲取 Google OAuth 憑證**
   - 前往 [Google Cloud Console](https://console.cloud.google.com/)
   - 創建 OAuth 2.0 憑證
   - 設定重定向 URI: `http://localhost:3001/api/auth/google/callback`

4. **獲取 Facebook OAuth 憑證**
   - 前往 [Facebook for Developers](https://developers.facebook.com/)
   - 創建應用程式並添加 Facebook 登入
   - 設定重定向 URI: `http://localhost:3001/api/auth/facebook/callback`

5. **更新 `.env` 文件**
   - 填入 Google Client ID 和 Secret
   - 填入 Facebook App ID 和 Secret
   - 生成並填入 Session Secret

6. **重新啟動伺服器**
   ```bash
   # 後端
   cd server
   npm run dev
   
   # 前端
   npm run dev
   ```

### 🟡 建議完成（提升使用體驗）

1. **添加 OAuth 回調路由**
   
   如果使用 Vue Router，需要添加路由：
   ```javascript
   {
     path: '/auth/callback',
     name: 'OAuthCallback',
     component: () => import('@/components/Auth/OAuthCallback.vue')
   }
   ```

2. **更新前端 API URL**
   
   如果前端 API URL 不是 `http://localhost:3001`，需要創建 `.env.local`：
   ```bash
   VITE_API_URL=http://localhost:3001
   ```

3. **測試所有登入流程**
   - Email/密碼登入
   - Google OAuth 登入
   - Facebook OAuth 登入
   - 帳號關聯功能

### 🟢 可選完成（生產環境）

1. **設定 HTTPS**
   - 使用 Let's Encrypt 或其他 SSL 憑證
   - 更新所有回調 URL 為 HTTPS

2. **更新生產環境配置**
   - 設定生產環境的 Google OAuth 重定向 URI
   - 設定生產環境的 Facebook OAuth 重定向 URI
   - 更新環境變數

3. **添加錯誤監控**
   - 整合 Sentry 或其他錯誤追蹤服務

4. **優化 Session 儲存**
   - 使用 Redis 或其他 Session Store
   - 設定 Session 過期策略

## 🎯 功能特色

### ✨ 用戶體驗
- ✅ 一鍵 Google 登入
- ✅ 一鍵 Facebook 登入
- ✅ 無縫的 OAuth 流程
- ✅ 自動帳號創建
- ✅ 自動 Email 關聯
- ✅ Loading 狀態提示
- ✅ 錯誤訊息顯示

### 🔐 安全特性
- ✅ JWT Token 認證
- ✅ Session 管理
- ✅ CSRF 保護（Passport 內建）
- ✅ 密碼欄位可選（OAuth 用戶）
- ✅ 審計日誌記錄
- ✅ 用戶資料加密儲存

### 📊 資料庫設計
- ✅ 支援多種認證提供商
- ✅ OAuth 資料儲存
- ✅ 用戶關聯邏輯
- ✅ 索引優化

## 🧪 測試流程

### 測試 Google 登入
1. 點擊「使用 Google 登入」
2. 選擇 Google 帳號
3. 授權應用程式
4. 自動跳轉回應用程式
5. 確認已登入

### 測試 Facebook 登入
1. 點擊「使用 Facebook 登入」
2. 輸入 Facebook 帳密
3. 授權應用程式
4. 自動跳轉回應用程式
5. 確認已登入

### 測試帳號關聯
1. 先用 Email 註冊帳號
2. 登出
3. 使用相同 Email 的 Google 帳號登入
4. 確認關聯到同一個帳號

### 驗證資料庫
```sql
-- 查看 OAuth 用戶
SELECT id, email, username, auth_provider, provider_id 
FROM users 
WHERE auth_provider IN ('google', 'facebook');

-- 查看 OAuth 登入日誌
SELECT user_id, action, details, created_at 
FROM audit_logs 
WHERE action IN ('oauth_login', 'oauth_register')
ORDER BY created_at DESC;
```

## 📁 檔案結構

```
quantgem-vue/
├── server/
│   ├── config/
│   │   └── passport.js              ✨ 新增
│   ├── database/
│   │   └── migrations/
│   │       └── add_oauth_support.sql ✨ 新增
│   ├── routes/
│   │   └── auth.js                   ✏️ 修改
│   ├── package.json                  ✏️ 修改
│   └── server.js                     ✏️ 修改
├── src/
│   ├── components/
│   │   └── Auth/
│   │       ├── LoginModal.vue        ✏️ 修改
│   │       ├── RegisterModal.vue     ✏️ 修改
│   │       └── OAuthCallback.vue     ✨ 新增
│   └── stores/
│       └── auth.js                   ✏️ 修改
├── .env                              ✏️ 修改
├── OAUTH_SETUP.md                    ✨ 新增
├── OAUTH_QUICKSTART.md               ✨ 新增
└── OAUTH_IMPLEMENTATION_SUMMARY.md   ✨ 新增（本文件）
```

## 🎓 學習資源

- [Passport.js 官方文檔](http://www.passportjs.org/)
- [Google OAuth 2.0 文檔](https://developers.google.com/identity/protocols/oauth2)
- [Facebook Login 文檔](https://developers.facebook.com/docs/facebook-login)

## 💡 提示

1. **開發環境**: 確保 Google 和 Facebook 控制台中添加 `http://localhost:3001` 作為授權來源
2. **生產環境**: 必須使用 HTTPS，並更新所有回調 URL
3. **測試帳號**: Facebook 需要添加測試用戶才能在開發模式下測試
4. **憑證安全**: 永遠不要將 OAuth 憑證提交到版本控制系統

## 📞 支援

如遇到問題，請檢查：
1. ✅ 所有依賴套件已安裝
2. ✅ 資料庫遷移已執行
3. ✅ 環境變數正確設定
4. ✅ 回調 URL 正確配置
5. ✅ 伺服器正在運行

---

**🎉 恭喜！您已成功整合 Google 和 Facebook OAuth 登入系統！**

開始測試請執行：
```bash
# 1. 安裝依賴
cd server && npm install

# 2. 執行遷移
psql -U postgres -d postgres -f server/database/migrations/add_oauth_support.sql

# 3. 配置 .env（填入您的 OAuth 憑證）

# 4. 啟動伺服器
npm run dev
```
