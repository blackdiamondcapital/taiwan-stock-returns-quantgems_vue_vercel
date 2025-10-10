# 快速啟動指南

## 🚨 無法註冊？按照以下步驟排查

### 步驟 1: 檢查資料庫

#### 1.1 確認 PostgreSQL 正在運行

```bash
# 檢查 PostgreSQL 狀態
brew services list | grep postgresql

# 如果沒有運行，啟動它
brew services start postgresql@14

# 或使用其他版本
brew services start postgresql
```

#### 1.2 創建 quantgem 資料庫

```bash
# 登入 PostgreSQL
psql postgres

# 創建資料庫
CREATE DATABASE quantgem;

# 查看資料庫列表
\l

# 退出
\q
```

#### 1.3 執行資料庫 Schema

```bash
# 執行認證系統 Schema
psql -U postgres -d quantgem -f server/database/auth_schema.sql

# 如果出現密碼提示，輸入你的 PostgreSQL 密碼
```

或者直接在 psql 中執行：

```bash
# 連接到 quantgem 資料庫
psql -U postgres -d quantgem

# 執行 Schema
\i server/database/auth_schema.sql

# 驗證表格已創建
\dt

# 應該看到：
# - users
# - subscriptions
# - payments
# - usage_limits
# - audit_logs
# 等表格

# 退出
\q
```

### 步驟 2: 安裝後端依賴

```bash
# 進入 server 目錄
cd server

# 安裝依賴
npm install

# 應該安裝以下套件：
# - express
# - cors
# - pg
# - bcrypt
# - jsonwebtoken
# - dotenv

# 返回根目錄
cd ..
```

### 步驟 3: 驗證 .env 配置

確認 `.env` 文件包含以下內容：

```env
# 資料庫配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quantgem
DB_USER=postgres
DB_PASSWORD=你的密碼

# 伺服器端口
PORT=3001

# JWT 密鑰（重要！）
JWT_SECRET=quantgem-super-secret-key-change-in-production-2024
```

### 步驟 4: 啟動後端伺服器

```bash
# 在根目錄或 server 目錄執行
node server/server.js

# 或使用 nodemon（如果已安裝）
cd server
npm run dev
```

**成功訊息應該是：**
```
API server running at http://localhost:3001
```

### 步驟 5: 啟動前端開發伺服器

**新開一個終端窗口**

```bash
# 在專案根目錄
npm run dev
```

**成功訊息應該是：**
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

### 步驟 6: 測試註冊

1. 打開瀏覽器訪問 `http://localhost:5173`
2. 點擊右上角「註冊」按鈕
3. 填寫資訊：
   - Email: `test@example.com`
   - 密碼: `password123`
   - 確認密碼: `password123`
   - 用戶名（選填）: `testuser`
4. 點擊「註冊」

## 🔍 常見問題排查

### 問題 1: ECONNREFUSED - 連接被拒絕

**錯誤訊息：**
```
Failed to fetch
net::ERR_CONNECTION_REFUSED
```

**原因：** 後端伺服器沒有運行

**解決方案：**
```bash
# 確認後端正在運行
node server/server.js
```

### 問題 2: 資料庫連接失敗

**錯誤訊息（終端）：**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
password authentication failed for user "postgres"
```

**解決方案：**

1. 確認 PostgreSQL 正在運行：
```bash
brew services list
```

2. 確認密碼正確（在 `.env` 中）：
```bash
# 測試連接
psql -U postgres -d quantgem

# 如果提示密碼錯誤，重設密碼：
psql postgres
ALTER USER postgres PASSWORD '新密碼';
\q
```

3. 更新 `.env` 文件中的密碼

### 問題 3: relation "users" does not exist

**錯誤訊息（終端）：**
```
error: relation "users" does not exist
```

**原因：** 資料庫表格沒有創建

**解決方案：**
```bash
# 執行 Schema
psql -U postgres -d quantgem -f server/database/auth_schema.sql

# 驗證表格
psql -U postgres -d quantgem -c "\dt"
```

### 問題 4: JWT Secret 未設置

**錯誤訊息（終端）：**
```
Error: JWT_SECRET is not defined
```

**解決方案：**

確認 `.env` 文件包含：
```env
JWT_SECRET=quantgem-super-secret-key-change-in-production-2024
```

然後重啟後端伺服器。

### 問題 5: bcrypt 相關錯誤

**錯誤訊息：**
```
Error: Cannot find module 'bcrypt'
```

**解決方案：**
```bash
cd server
npm install bcrypt

# 如果安裝失敗，可能需要安裝 build tools
# macOS:
xcode-select --install

# 然後重新安裝
npm install bcrypt
```

### 問題 6: CORS 錯誤

**錯誤訊息（瀏覽器控制台）：**
```
Access to fetch at 'http://localhost:3001/api/auth/register' from origin 'http://localhost:5173' has been blocked by CORS policy
```

**解決方案：**

這應該已經在 `server/server.js` 中配置了，但如果還有問題，確認：

```javascript
app.use(cors());
```

在所有路由之前。

## 📝 測試用戶資料

註冊測試用戶時使用：

```
Email: test@example.com
密碼: password123
確認密碼: password123
用戶名: testuser
全名: Test User
```

## 🎯 快速檢查清單

在註冊之前，確認以下都打勾：

- [ ] PostgreSQL 正在運行 (`brew services list`)
- [ ] quantgem 資料庫已創建 (`psql -U postgres -l`)
- [ ] 資料庫表格已創建 (`psql -U postgres -d quantgem -c "\dt"`)
- [ ] .env 文件配置正確（特別是 JWT_SECRET）
- [ ] 後端依賴已安裝 (`cd server && npm install`)
- [ ] 後端伺服器正在運行（看到 "API server running at..."）
- [ ] 前端伺服器正在運行（看到 "Local: http://localhost:5173"）
- [ ] 瀏覽器可以訪問 http://localhost:5173
- [ ] 瀏覽器控制台沒有錯誤訊息

## 🧪 測試資料庫連接

創建一個簡單的測試腳本：

```bash
# 創建 test-db.js
cat > test-db.js << 'EOF'
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'quantgem',
});

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ 資料庫連接成功！');
    console.log('當前時間:', result.rows[0].now);
    
    // 測試 users 表格
    const usersCheck = await pool.query(`
      SELECT COUNT(*) FROM users
    `);
    console.log('✅ users 表格存在');
    console.log('用戶數量:', usersCheck.rows[0].count);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 資料庫連接失敗:');
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
EOF

# 執行測試
node test-db.js
```

## 📞 仍然無法解決？

### 查看日誌

1. **後端日誌**（終端運行 server 的窗口）
   - 查看是否有錯誤訊息
   - 特別注意資料庫相關錯誤

2. **前端日誌**（瀏覽器開發者工具）
   - 按 F12 或 Cmd+Option+I
   - 查看 Console 頁籤
   - 查看 Network 頁籤，看 API 請求狀態

3. **資料庫日誌**
```bash
# macOS PostgreSQL 日誌位置
tail -f /usr/local/var/log/postgres.log
```

### 完全重置

如果以上都不行，嘗試完全重置：

```bash
# 1. 停止所有服務
# Ctrl+C 停止前後端伺服器

# 2. 刪除並重建資料庫
psql postgres
DROP DATABASE quantgem;
CREATE DATABASE quantgem;
\q

# 3. 重新執行 Schema
psql -U postgres -d quantgem -f server/database/auth_schema.sql

# 4. 重新安裝依賴
cd server
rm -rf node_modules package-lock.json
npm install
cd ..

# 5. 清除瀏覽器緩存和 LocalStorage
# 在瀏覽器開發者工具中：
# Application > Local Storage > 刪除所有項目
# Application > Cache > Clear storage

# 6. 重新啟動
node server/server.js  # 終端 1
npm run dev            # 終端 2
```

## 🎉 成功標誌

當一切正常時，你應該看到：

**終端 1（後端）：**
```
API server running at http://localhost:3001
```

**終端 2（前端）：**
```
➜  Local:   http://localhost:5173/
```

**瀏覽器：**
- 可以看到 QuantGem 首頁
- 點擊「註冊」彈出註冊模態框
- 填寫資訊後點擊「註冊」
- 看到「註冊成功」訊息
- 自動登入並看到用戶名在右上角

---

需要更多幫助？提供具體的錯誤訊息！🚀
