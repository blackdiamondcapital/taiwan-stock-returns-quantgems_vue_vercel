# 用戶登入系統安裝指南

## 📋 概述

本指南將幫助你完成用戶認證系統的設置，包括資料庫初始化、必要套件安裝和伺服器配置。

## 🔧 必要套件安裝

### 1. 安裝後端依賴

```bash
cd server
npm install bcrypt jsonwebtoken pg dotenv
```

套件說明：
- **bcrypt**: 密碼加密
- **jsonwebtoken**: JWT Token 生成與驗證
- **pg**: PostgreSQL 資料庫驅動
- **dotenv**: 環境變數管理

### 2. 前端已包含的套件

前端使用 Vue 3 原生 API，無需額外安裝套件。

## 🗄️ 資料庫設置

### 1. 確認 PostgreSQL 已安裝並運行

```bash
# macOS
brew services start postgresql@14

# 檢查狀態
brew services list
```

### 2. 創建資料庫（如果還沒有）

```bash
# 登入 PostgreSQL
psql postgres

# 創建資料庫
CREATE DATABASE quantgem;

# 退出
\q
```

### 3. 執行 Schema

```bash
# 執行認證系統 Schema
psql -U postgres -d quantgem -f server/database/auth_schema.sql
```

或者直接在 psql 中執行：

```bash
psql -U postgres -d quantgem

# 然後複製貼上 auth_schema.sql 的內容
\i server/database/auth_schema.sql
```

### 4. 驗證表格已創建

```sql
-- 列出所有表格
\dt

-- 應該看到以下表格：
-- users
-- subscriptions
-- payments
-- coupons
-- coupon_usage
-- referrals
-- usage_limits
-- audit_logs
```

## ⚙️ 環境變數配置

### 1. 創建 `.env` 文件（如果還沒有）

在專案根目錄創建 `.env`：

```bash
# 資料庫配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=quantgem

# JWT 密鑰（請更改為隨機字串）
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# 伺服器配置
PORT=3001
NODE_ENV=development

# 資料庫連接字串（可選，優先使用）
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/quantgem
```

### 2. 生成安全的 JWT 密鑰

```bash
# 使用 Node.js 生成隨機密鑰
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

將生成的字串替換 `JWT_SECRET` 的值。

## 🚀 啟動服務

### 1. 啟動後端 API 伺服器

```bash
# 在 server 目錄
cd server
npm run dev
```

或者：

```bash
# 在根目錄
node server/server.js
```

伺服器應該運行在 `http://localhost:3001`

### 2. 啟動前端開發伺服器

```bash
# 在根目錄
npm run dev
```

前端應該運行在 `http://localhost:5173`

## ✅ 測試認證系統

### 1. 使用瀏覽器測試

1. 打開 `http://localhost:5173`
2. 點擊右上角「註冊」按鈕
3. 填寫註冊表單
4. 註冊成功後自動登入
5. 查看個人資料頁面

### 2. 使用 API 測試（可選）

#### 註冊用戶

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "username": "testuser"
  }'
```

#### 登入

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

#### 獲取用戶資訊

```bash
# 將 YOUR_TOKEN 替換為登入返回的 token
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📊 資料庫管理工具（推薦）

### 1. pgAdmin 4

圖形化界面管理 PostgreSQL：

```bash
brew install --cask pgadmin4
```

### 2. DBeaver

跨平台資料庫管理工具：

```bash
brew install --cask dbeaver-community
```

### 3. TablePlus

優雅的資料庫客戶端（付費）：

```bash
brew install --cask tableplus
```

## 🔍 常見問題

### Q1: 資料庫連接失敗

**錯誤**: `ECONNREFUSED` 或 `password authentication failed`

**解決方案**:
1. 檢查 PostgreSQL 是否運行
2. 確認 `.env` 中的資料庫密碼正確
3. 檢查資料庫名稱是否存在

```bash
# 重啟 PostgreSQL
brew services restart postgresql@14
```

### Q2: JWT Token 錯誤

**錯誤**: `JsonWebTokenError: invalid token`

**解決方案**:
1. 清除瀏覽器 LocalStorage
2. 重新登入
3. 確認 `JWT_SECRET` 在前後端一致

### Q3: 表格不存在

**錯誤**: `relation "users" does not exist`

**解決方案**:
重新執行 Schema：

```bash
psql -U postgres -d quantgem -f server/database/auth_schema.sql
```

### Q4: bcrypt 安裝失敗

**錯誤**: `node-gyp` 相關錯誤

**解決方案**:

```bash
# macOS
xcode-select --install

# 安裝 bcrypt
npm install bcrypt --save
```

## 📝 開發建議

### 1. 開發環境設置

```bash
# 使用 nodemon 自動重啟伺服器
npm install -D nodemon

# package.json 中添加
"scripts": {
  "dev": "nodemon server/server.js"
}
```

### 2. 日誌記錄

安裝 winston 或 pino 進行更好的日誌管理：

```bash
npm install winston
```

### 3. 資料庫遷移工具（進階）

使用 Knex.js 或 Prisma 進行資料庫版本控制：

```bash
npm install knex
npx knex init
```

## 🔐 生產環境注意事項

### 1. 環境變數

- 使用強隨機密碼
- 不要提交 `.env` 到版本控制
- 使用環境變數管理服務（如 AWS Secrets Manager）

### 2. 資料庫

- 啟用 SSL 連接
- 定期備份
- 設置連接池限制

### 3. API 安全

- 啟用 HTTPS
- 設置速率限制（rate limiting）
- 添加 CORS 白名單

## 📚 API 端點總覽

| 端點 | 方法 | 描述 | 需要認證 |
|------|------|------|----------|
| `/api/auth/register` | POST | 註冊新用戶 | ❌ |
| `/api/auth/login` | POST | 用戶登入 | ❌ |
| `/api/auth/logout` | POST | 用戶登出 | ✅ |
| `/api/auth/me` | GET | 獲取當前用戶 | ✅ |
| `/api/auth/profile` | PUT | 更新用戶資料 | ✅ |
| `/api/auth/change-password` | PUT | 修改密碼 | ✅ |

## 🎉 完成！

如果所有步驟都正確執行，你應該能夠：

✅ 註冊新用戶  
✅ 登入/登出  
✅ 查看和編輯個人資料  
✅ 修改密碼  
✅ 看到用戶計劃徽章  

## 📞 需要幫助？

如果遇到問題：

1. 檢查瀏覽器控制台的錯誤訊息
2. 查看伺服器終端的日誌輸出
3. 檢查資料庫連接狀態
4. 確認所有環境變數正確設置

祝你開發順利！🚀
