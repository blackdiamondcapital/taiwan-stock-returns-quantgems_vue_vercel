# Email 和 LINE 通知設定指南

本文檔說明如何設定 Email 和 LINE Notify 警示通知功能。

## 📋 目錄

1. [資料庫設定](#資料庫設定)
2. [安裝依賴套件](#安裝依賴套件)
3. [Email 通知設定](#email-通知設定)
4. [LINE Notify 設定](#line-notify-設定)
5. [使用說明](#使用說明)
6. [故障排除](#故障排除)

---

## 資料庫設定

### 1. 執行資料庫遷移

新增通知相關欄位到 `users` 資料表：

```bash
cd server
psql -U postgres -d quantgem -f database/migrations/add_notification_fields.sql
```

或直接執行 SQL：

```sql
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
```

---

## 安裝依賴套件

### 1. 安裝後端套件

```bash
cd server
npm install nodemailer node-fetch
```

### 2. 確認套件版本

在 `server/package.json` 中應該包含：

```json
{
  "dependencies": {
    "nodemailer": "^6.9.7",
    "node-fetch": "^3.3.2"
  }
}
```

---

## Email 通知設定

### 1. 取得 SMTP 設定

#### 使用 Gmail

1. 登入 Gmail 帳號
2. 前往「Google 帳戶」 → 「安全性」
3. 啟用「兩步驟驗證」
4. 在「兩步驟驗證」頁面，找到「應用程式密碼」
5. 選擇「郵件」和「其他裝置」，生成應用程式密碼
6. 複製生成的 16 位密碼

#### 使用其他 SMTP 服務

| 服務商 | SMTP 主機 | 端口 | 安全性 |
|--------|-----------|------|--------|
| Gmail | smtp.gmail.com | 587 | STARTTLS |
| Outlook | smtp-mail.outlook.com | 587 | STARTTLS |
| Yahoo | smtp.mail.yahoo.com | 587 | STARTTLS |
| Mailgun | smtp.mailgun.org | 587 | STARTTLS |

### 2. 設定環境變數

編輯 `server/.env` 檔案：

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password_here
```

**重要提醒：**
- `SMTP_PASS` 使用「應用程式密碼」，不是 Gmail 登入密碼
- 不要把 `.env` 檔案提交到版控系統
- Gmail 每日發送上限為 500 封

---

## LINE Notify 設定

### 1. 申請 LINE Notify Token

1. 前往 [LINE Notify 官網](https://notify-bot.line.me/my/)
2. 使用 LINE 帳號登入
3. 點擊「發行權杖」
4. 選擇要接收通知的聊天室（1對1聊天或群組）
5. 輸入權杖名稱（例如：QuantGem 警示）
6. 點擊「發行」
7. **複製並妥善保管 Token**（只會顯示一次！）

### 2. Token 格式

LINE Notify Token 格式範例：
```
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

長度約 43 個字元

### 3. 設定 Token

用戶需要在前端「警示設定」頁面的「通知設定」區塊輸入 Token。

---

## 使用說明

### 前端操作步驟

1. **登入系統**

2. **前往警示設定頁面**
   - 點擊導航欄的「警示設定」

3. **開啟通知設定面板**
   - 點擊頁面頂部的「設定」按鈕

4. **設定 Email 通知**
   - 輸入接收通知的 Email 地址
   - 勾選「啟用 Email 通知」
   - 點擊「儲存設定」
   - （選用）點擊「發送測試郵件」確認設定

5. **設定 LINE 通知**
   - 貼上從 LINE Notify 取得的 Token
   - 勾選「啟用 LINE 通知」
   - 點擊「儲存設定」
   - （選用）點擊「發送測試訊息」確認設定

6. **建立警示規則**
   - 在「新增警示規則」卡片中設定條件
   - 點擊「新增規則」

7. **觸發通知**
   - 當警示條件達成時，系統會自動發送通知到：
     - ✅ 瀏覽器推送通知（若已授權）
     - ✅ Email（若已啟用）
     - ✅ LINE（若已啟用）

---

## API 端點說明

### 通知設定相關

```
GET    /api/notifications/settings          # 獲取通知設定
POST   /api/notifications/email/update      # 更新 Email 設定
POST   /api/notifications/email/test        # 測試 Email 發送
POST   /api/notifications/line/update       # 更新 LINE 設定
POST   /api/notifications/line/test         # 測試 LINE 發送
POST   /api/notifications/send-alert        # 發送警示通知
```

所有 API 都需要 JWT Token 驗證。

---

## 故障排除

### Email 問題

#### 問題：無法發送 Email

**可能原因：**
1. SMTP 設定錯誤
2. Gmail 應用程式密碼過期
3. 防火牆阻擋端口 587

**解決方法：**
```bash
# 查看後端 console 錯誤訊息
cd server
npm run dev

# 測試 SMTP 連線
node -e "const nodemailer = require('nodemailer'); const t = nodemailer.createTransport({host:'smtp.gmail.com',port:587,auth:{user:'your@email.com',pass:'password'}}); t.verify((e,s)=>console.log(e||'OK'))"
```

#### 問題：Gmail 拒絕連線

**解決方法：**
1. 確認已啟用「兩步驟驗證」
2. 使用「應用程式密碼」而非帳號密碼
3. 檢查是否啟用「低安全性應用程式存取權」（舊版）

### LINE Notify 問題

#### 問題：Token 無效

**可能原因：**
1. Token 複製錯誤（多空格或換行）
2. Token 已被撤銷
3. Token 過期

**解決方法：**
1. 重新申請 Token
2. 確保 Token 沒有多餘空白字元
3. 測試 Token 有效性：
   ```bash
   curl -X POST https://notify-api.line.me/api/status \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

#### 問題：未收到 LINE 通知

**檢查項目：**
1. ✅ Token 是否正確設定
2. ✅ 是否勾選「啟用 LINE 通知」
3. ✅ LINE 群組是否已加入 LINE Notify
4. ✅ 查看後端 console 是否有錯誤

### 通用問題

#### 問題：資料庫錯誤

```
ERROR: column "notification_email" does not exist
```

**解決方法：**
執行資料庫遷移腳本（見上方「資料庫設定」）

#### 問題：前端無法連接 API

**檢查項目：**
1. 後端伺服器是否運行（http://localhost:3001）
2. CORS 設定是否正確
3. JWT Token 是否有效

---

## 安全建議

1. **不要分享敏感資訊**
   - SMTP 密碼
   - LINE Notify Token
   - JWT Secret

2. **環境變數管理**
   - 將 `.env` 加入 `.gitignore`
   - 使用環境變數管理工具（如 dotenv-vault）

3. **Token 管理**
   - 定期更換 LINE Notify Token
   - 不使用時撤銷 Token

4. **發送頻率限制**
   - Gmail: 500 封/天
   - LINE Notify: 1000 則/小時

---

## 進階功能建議

### 未來可擴充功能

1. **Email 模板自訂**
   - HTML 郵件模板
   - 圖表嵌入

2. **多通道通知**
   - Telegram Bot
   - Discord Webhook
   - Slack Integration

3. **通知優先級**
   - 緊急警示使用多通道
   - 一般警示單通道

4. **通知統計**
   - 發送成功率
   - 通知歷史記錄

---

## 相關資源

- [Nodemailer 文檔](https://nodemailer.com/)
- [LINE Notify API 文檔](https://notify-bot.line.me/doc/)
- [Gmail SMTP 設定指南](https://support.google.com/mail/answer/7126229)

---

## 技術支援

如遇到問題，請提供以下資訊：

1. 錯誤訊息（後端 console）
2. 瀏覽器 console 錯誤
3. 使用的 SMTP 服務商
4. Node.js 版本：`node -v`
5. 套件版本：`npm list nodemailer node-fetch`

---

**最後更新：** 2025-10-04
