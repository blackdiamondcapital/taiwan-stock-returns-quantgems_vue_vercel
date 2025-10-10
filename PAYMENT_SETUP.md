# 金流整合設置指南

## 📋 概述

本指南將幫助你完成 ECPay (綠界科技) 金流系統的串接，實現訂閱制商業模式。

## 🔐 ECPay 帳號申請

### 1. 註冊 ECPay 測試帳號

前往 [ECPay 測試環境](https://vendor-stage.ecpay.com.tw/) 註冊帳號：

1. 點擊「註冊會員」
2. 填寫公司/個人資訊
3. 完成 Email 驗證
4. 登入後台獲取測試金鑰

### 2. 獲取測試金鑰

登入後台後，在「系統設定」→「系統介接設定」中獲取：

- **商店代號 (MerchantID)**: 測試環境為 `2000132`
- **HashKey**: `5294y06JbISpM5x9`
- **HashIV**: `v77hoKGq4kWxNNIS`

> ⚠️ **注意**: 測試環境的金鑰已內建在代碼中，生產環境必須使用自己的金鑰！

### 3. 申請正式環境

準備好上線時，需要：

1. 申請正式商店帳號
2. 提供公司/商業登記證明
3. 簽署合約
4. 通過審核後獲得正式金鑰

## ⚙️ 環境變數配置

在 `.env` 文件中添加 ECPay 相關配置：

```env
# ECPay 測試環境（開發階段使用）
ECPAY_MERCHANT_ID=2000132
ECPAY_HASH_KEY=5294y06JbISpM5x9
ECPAY_HASH_IV=v77hoKGq4kWxNNIS
ECPAY_API_URL=https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5

# ECPay 正式環境（上線後使用）
# ECPAY_MERCHANT_ID=your_real_merchant_id
# ECPAY_HASH_KEY=your_real_hash_key
# ECPAY_HASH_IV=your_real_hash_iv
# ECPAY_API_URL=https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5

# 回調 URL（根據實際部署環境修改）
ECPAY_RETURN_URL=http://localhost:5173/payment/return
ECPAY_NOTIFY_URL=http://localhost:3001/api/payment/ecpay/notify

# 前端 URL
FRONTEND_URL=http://localhost:5173
```

## 🚀 啟動服務

### 1. 確認已安裝依賴

```bash
# 後端依賴（在 server 目錄）
cd server
npm install

# 應該已包含：
# - express
# - pg
# - bcrypt
# - jsonwebtoken
# - cors
# - dotenv
```

### 2. 啟動後端伺服器

```bash
# 在 server 目錄
npm run dev

# 或
node server.js
```

伺服器應該運行在 `http://localhost:3001`

### 3. 啟動前端開發伺服器

```bash
# 在根目錄
npm run dev
```

前端應該運行在 `http://localhost:5173`

## 💳 功能測試

### 1. 查看訂閱方案

1. 打開 `http://localhost:5173`
2. 點擊導航欄的「訂閱方案」
3. 應該看到 Pro 和 Enterprise 兩個方案

### 2. 測試訂閱流程

#### 步驟 1: 註冊/登入

1. 點擊右上角「註冊」按鈕
2. 填寫註冊資訊
3. 註冊成功後自動登入

#### 步驟 2: 選擇方案

1. 在「訂閱方案」頁面，選擇 Pro 或 Enterprise
2. 點擊「立即訂閱」按鈕
3. 等待跳轉到 ECPay 支付頁面

#### 步驟 3: 完成付款（測試環境）

在 ECPay 測試環境，使用測試信用卡：

**測試信用卡號**:
```
卡號: 4311-9522-2222-2222
有效期限: 隨意填寫（未來日期）
CVV: 隨意填寫（3碼）
```

> 💡 **提示**: 測試環境不會真的扣款，可以任意測試

#### 步驟 4: 返回確認

1. 付款完成後會自動返回應用
2. 查看「訂閱管理」確認訂閱狀態
3. 查看「個人資料」確認方案已升級

### 3. 測試訂閱管理

1. 進入「訂閱管理」頁面
2. 查看當前訂閱資訊
3. 測試取消訂閱功能
4. 測試重新啟用功能
5. 查看訂閱歷史和支付歷史

## 📊 API 端點總覽

### 訂閱方案 API

| 端點 | 方法 | 描述 | 需要認證 |
|------|------|------|----------|
| `/api/payment/plans` | GET | 獲取訂閱方案列表 | ❌ |
| `/api/payment/subscribe` | POST | 創建訂閱支付訂單 | ✅ |
| `/api/payment/cancel-subscription` | POST | 取消訂閱 | ✅ |
| `/api/payment/reactivate-subscription` | POST | 重新啟用訂閱 | ✅ |
| `/api/payment/subscription-history` | GET | 獲取訂閱歷史 | ✅ |
| `/api/payment/payment-history` | GET | 獲取支付歷史 | ✅ |

### ECPay 回調 API

| 端點 | 方法 | 描述 |
|------|------|------|
| `/api/payment/ecpay/return` | POST | 用戶付款完成返回 |
| `/api/payment/ecpay/notify` | POST | ECPay 服務器通知 |

## 🔍 測試支付流程

### 使用 Postman 測試

#### 1. 創建訂閱

```bash
POST http://localhost:3001/api/payment/subscribe
Headers:
  Content-Type: application/json
  Authorization: Bearer YOUR_JWT_TOKEN

Body:
{
  "plan": "pro"
}

Response:
{
  "success": true,
  "data": {
    "paymentData": {
      "action": "https://payment-stage.ecpay.com.tw/...",
      "params": { ... },
      "tradeNo": "QG1234567890"
    },
    "subscriptionId": 1
  }
}
```

#### 2. 模擬 ECPay 回調

```bash
POST http://localhost:3001/api/payment/ecpay/notify
Content-Type: application/x-www-form-urlencoded

Body:
MerchantID=2000132
&MerchantTradeNo=QG1234567890
&RtnCode=1
&RtnMsg=交易成功
&TradeNo=2023010112345678
&TradeAmt=299
&PaymentDate=2023/01/01 12:00:00
&PaymentType=Credit_CreditCard
&CustomField1=1
&CustomField2=pro
&CustomField3=user@example.com
&CheckMacValue=GENERATED_CHECKSUM
```

## 🔒 安全性配置

### 1. CheckMacValue 驗證

所有 ECPay 回調都會驗證 `CheckMacValue`：

```javascript
// 自動驗證（已實作）
const isValid = verifyCheckMacValue(notification);
if (!isValid) {
  throw new Error('Invalid CheckMacValue');
}
```

### 2. 生產環境注意事項

#### 更新 ECPay 配置

在 `server/services/ecpay.js` 中：

```javascript
const ECPAY_CONFIG = {
  // 使用正式環境
  merchantId: process.env.ECPAY_MERCHANT_ID,
  hashKey: process.env.ECPAY_HASH_KEY,
  hashIV: process.env.ECPAY_HASH_IV,
  apiUrl: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
  
  // 更新為正式域名
  returnUrl: 'https://yourdomain.com/payment/return',
  notifyUrl: 'https://yourdomain.com/api/payment/ecpay/notify',
};
```

#### 設置 HTTPS

ECPay 正式環境要求使用 HTTPS：

```bash
# 使用 Let's Encrypt 獲取免費 SSL 證書
sudo certbot --nginx -d yourdomain.com
```

#### 設置 Webhook URL

在 ECPay 後台設置正式的 Webhook URL：
- 付款完成通知 URL: `https://yourdomain.com/api/payment/ecpay/notify`
- 返回網址: `https://yourdomain.com/payment/return`

### 3. 環境變數安全

```bash
# 永遠不要提交 .env 到版本控制
echo ".env" >> .gitignore

# 使用環境變數管理服務
# - Heroku Config Vars
# - AWS Secrets Manager
# - Google Cloud Secret Manager
```

## 📈 訂閱方案設定

### 修改方案價格

在 `server/services/ecpay.js` 中：

```javascript
export const SUBSCRIPTION_PLANS = {
  pro: {
    id: 'pro',
    name: 'Pro 專業版',
    price: 299, // 修改這裡
    period: 'monthly',
    features: [
      // 修改功能列表
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise 企業版',
    price: 999, // 修改這裡
    period: 'monthly',
    features: [
      // 修改功能列表
    ],
  },
};
```

### 新增方案

1. 在 `SUBSCRIPTION_PLANS` 中添加新方案
2. 更新前端 `Pricing.vue` 組件
3. 更新資料庫 `subscriptions` 表的 `plan` 欄位約束

## 🔄 自動續訂設置

### ECPay 定期定額

ECPay 提供定期定額服務，需要：

1. 另外申請定期定額功能
2. 使用不同的 API 端點
3. 實作週期性扣款邏輯

目前實作為**手動續訂模式**：
- 訂閱到期前通知用戶
- 用戶手動點擊續訂
- 重新建立支付訂單

### 實作自動續訂（進階）

```javascript
// 使用 Cron Job 檢查即將到期的訂閱
import cron from 'node-cron';

// 每天檢查一次
cron.schedule('0 0 * * *', async () => {
  // 查詢 7 天內到期且 auto_renew = true 的訂閱
  const expiringSubs = await pool.query(`
    SELECT * FROM subscriptions
    WHERE end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    AND auto_renew = true
    AND status = 'active'
  `);
  
  // 發送續訂提醒 Email
  for (const sub of expiringSubs.rows) {
    await sendRenewalReminder(sub);
  }
});
```

## 💡 進階功能

### 1. 優惠券系統

已建立優惠券資料表，實作步驟：

1. 創建優惠券 API
2. 在訂閱流程中驗證優惠券
3. 計算折扣後金額
4. 記錄使用歷史

### 2. 推薦獎勵

已建立推薦資料表，實作步驟：

1. 生成推薦碼
2. 追蹤推薦來源
3. 給予推薦獎勵（免費月份/折扣）

### 3. 發票功能

整合發票系統：

1. 串接電子發票 API
2. 自動開立發票
3. 寄送發票至用戶 Email

### 4. Email 通知

實作 Email 通知服務：

```bash
npm install nodemailer

# 使用 SendGrid, Mailgun, 或 AWS SES
```

通知類型：
- 訂閱成功通知
- 支付成功通知
- 訂閱即將到期提醒
- 續訂失敗通知

## 🐛 常見問題

### Q1: CheckMacValue 驗證失敗

**問題**: ECPay 回調驗證失敗

**解決方案**:
1. 確認 HashKey 和 HashIV 正確
2. 檢查參數編碼方式
3. 確認參數排序正確
4. 查看 ECPay 文件的最新規範

### Q2: 支付後沒有收到回調

**問題**: 用戶付款完成但資料庫沒有更新

**解決方案**:
1. 檢查 `notifyUrl` 是否可以從外網訪問
2. 使用 [ngrok](https://ngrok.com/) 在本地測試 Webhook
3. 查看伺服器日誌的錯誤訊息
4. 確認防火牆沒有阻擋 ECPay 的 IP

### Q3: 測試信用卡被拒絕

**問題**: 測試環境無法完成支付

**解決方案**:
1. 確認使用正確的測試卡號
2. 確認在測試環境而非正式環境
3. 查看 ECPay 測試文件

### Q4: 本地測試 Webhook

**使用 ngrok**:

```bash
# 安裝 ngrok
brew install ngrok

# 啟動 tunnel
ngrok http 3001

# 複製 https URL
# 更新 ECPAY_NOTIFY_URL
```

## 📚 參考資源

- [ECPay API 文件](https://www.ecpay.com.tw/Service/API_Dwnld)
- [ECPay 測試環境](https://vendor-stage.ecpay.com.tw/)
- [ECPay GitHub 範例](https://github.com/ECPay)

## 🎉 完成！

現在你的應用已經完整整合了金流系統！

**功能清單**:
- ✅ 訂閱方案展示
- ✅ ECPay 支付整合
- ✅ 訂閱管理
- ✅ 支付歷史記錄
- ✅ 取消/重新啟用訂閱
- ✅ 自動升級用戶方案
- ✅ 審計日誌記錄

**下一步建議**:
1. 申請 ECPay 正式環境帳號
2. 實作 Email 通知系統
3. 添加優惠券功能
4. 實作推薦獎勵計畫
5. 整合電子發票

需要協助或想要添加更多功能，隨時告訴我！🚀
