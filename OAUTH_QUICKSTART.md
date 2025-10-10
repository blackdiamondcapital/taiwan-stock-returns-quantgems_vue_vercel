# Google & Facebook OAuth 快速開始指南 ⚡

## 📦 步驟 1：安裝依賴

```bash
cd server
npm install
```

新增的套件：
- `passport` - 認證中介軟體
- `passport-google-oauth20` - Google OAuth 策略
- `passport-facebook` - Facebook OAuth 策略
- `express-session` - Session 管理

## 🗄️ 步驟 2：執行資料庫遷移

```bash
psql -U postgres -d postgres -f server/database/migrations/add_oauth_support.sql
```

這將添加以下欄位到 `users` 表：
- `auth_provider` - 認證提供商 (email/google/facebook)
- `provider_id` - OAuth 提供商的用戶 ID
- `provider_data` - OAuth 提供商返回的額外數據

## 🔑 步驟 3：獲取 OAuth 憑證

### Google OAuth

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 創建新專案或選擇現有專案
3. 啟用 Google+ API
4. 創建 OAuth 2.0 憑證（網頁應用程式）
5. 設定授權的重新導向 URI：
   ```
   http://localhost:3001/api/auth/google/callback
   ```
6. 複製 **Client ID** 和 **Client Secret**

### Facebook OAuth

1. 前往 [Facebook for Developers](https://developers.facebook.com/)
2. 創建應用程式（類型：消費者）
3. 添加 Facebook 登入產品
4. 設定有效的 OAuth 重新導向 URI：
   ```
   http://localhost:3001/api/auth/facebook/callback
   ```
5. 複製 **App ID** 和 **App Secret**

## ⚙️ 步驟 4：配置環境變數

編輯 `.env` 文件，添加 OAuth 憑證：

```bash
# Google OAuth
GOOGLE_CLIENT_ID=你的_Google_Client_ID
GOOGLE_CLIENT_SECRET=你的_Google_Client_Secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=你的_Facebook_App_ID
FACEBOOK_APP_SECRET=你的_Facebook_App_Secret
FACEBOOK_CALLBACK_URL=http://localhost:3001/api/auth/facebook/callback

# Session Secret
SESSION_SECRET=請改成隨機字串
```

**⚠️ 重要：** 將上述占位符替換為實際憑證！

### 生成隨機 Session Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 🚀 步驟 5：啟動應用程式

### 啟動後端

```bash
cd server
npm run dev
```

伺服器運行在：`http://localhost:3001`

### 啟動前端

```bash
# 在專案根目錄
npm run dev
```

前端運行在：`http://localhost:5173`

## ✅ 步驟 6：測試登入

1. 打開瀏覽器訪問 `http://localhost:5173`
2. 點擊右上角「登入」按鈕
3. 選擇「使用 Google 登入」或「使用 Facebook 登入」
4. 完成 OAuth 授權流程
5. 登入成功後自動返回首頁！

## 🎯 API 端點

### Google OAuth
- **啟動流程**: `GET /api/auth/google`
- **回調處理**: `GET /api/auth/google/callback`

### Facebook OAuth
- **啟動流程**: `GET /api/auth/facebook`
- **回調處理**: `GET /api/auth/facebook/callback`

## 📋 檢查清單

- [ ] 安裝所有依賴套件
- [ ] 執行資料庫遷移
- [ ] 獲取 Google OAuth 憑證
- [ ] 獲取 Facebook OAuth 憑證
- [ ] 配置 `.env` 文件
- [ ] 啟動後端伺服器
- [ ] 啟動前端伺服器
- [ ] 測試 Google 登入
- [ ] 測試 Facebook 登入

## 🐛 常見問題

### 問題 1：Redirect URI 不匹配

**錯誤**: `redirect_uri_mismatch`

**解決**:
- 檢查 Google/Facebook 控制台中的重定向 URI
- 確保與 `.env` 中的 `CALLBACK_URL` 完全一致
- 注意 `http` vs `https`

### 問題 2：無法連接資料庫

**解決**:
```bash
# 檢查 PostgreSQL 是否運行
brew services list

# 重啟 PostgreSQL
brew services restart postgresql@14
```

### 問題 3：Session 錯誤

**解決**:
- 確認 `SESSION_SECRET` 已設定在 `.env` 中
- 清除瀏覽器 Cookie 重試

## 📚 詳細文檔

完整設定說明請查看：[OAUTH_SETUP.md](./OAUTH_SETUP.md)

## 🎉 完成！

如果一切順利，您現在可以使用 Google 和 Facebook 帳號登入了！

需要幫助？檢查：
- 瀏覽器控制台錯誤
- 伺服器終端日誌
- Google/Facebook 開發者控制台

---

**提示**：首次 OAuth 登入會自動創建新帳號。如果該 Email 已註冊，系統會自動連結到現有帳號。
