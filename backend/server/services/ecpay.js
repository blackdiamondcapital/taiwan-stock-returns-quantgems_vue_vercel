import crypto from 'crypto';

/**
 * ECPay (綠界科技) 金流服務
 * API 文件: https://www.ecpay.com.tw/Service/API_Dwnld
 */

// ECPay 配置（從環境變數讀取）
const ECPAY_CONFIG = {
  // 測試環境
  merchantId: process.env.ECPAY_MERCHANT_ID || '2000132',
  hashKey: process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9',
  hashIV: process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS',
  apiUrl: process.env.ECPAY_API_URL || 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  
  // 生產環境（上線時使用）
  // merchantId: process.env.ECPAY_MERCHANT_ID,
  // hashKey: process.env.ECPAY_HASH_KEY,
  // hashIV: process.env.ECPAY_HASH_IV,
  // apiUrl: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
  
  // 回調 URL
  returnUrl: process.env.ECPAY_RETURN_URL || 'http://localhost:5173/payment/return',
  notifyUrl: process.env.ECPAY_NOTIFY_URL || 'http://localhost:3001/api/payment/ecpay/notify',
};

// 訂閱方案配置
export const SUBSCRIPTION_PLANS = {
  pro: {
    id: 'pro',
    name: 'Pro 專業版',
    price: 299,
    period: 'monthly',
    features: [
      '無限股票比較',
      '無限警示規則',
      '匯出報表功能（10次/天）',
      '歷史數據回測',
      '進階圖表分析',
      '優先客服支援',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise 企業版',
    price: 999,
    period: 'monthly',
    features: [
      'Pro 所有功能',
      'API 存取權限',
      '即時推播通知',
      '客製化儀表板',
      '專屬客服經理',
      '白標解決方案',
      '無限資料匯出',
    ],
  },
};

/**
 * 生成 ECPay CheckMacValue
 * @param {Object} params - 參數物件
 * @returns {string} CheckMacValue
 */
function generateCheckMacValue(params) {
  // 1. 參數依照字母順序排序
  const sortedKeys = Object.keys(params).sort();
  
  // 2. 組合參數字串
  let checkStr = `HashKey=${ECPAY_CONFIG.hashKey}`;
  
  for (const key of sortedKeys) {
    if (params[key] !== null && params[key] !== undefined) {
      checkStr += `&${key}=${params[key]}`;
    }
  }
  
  checkStr += `&HashIV=${ECPAY_CONFIG.hashIV}`;
  
  // 3. URL encode (ECPay 特殊處理)
  checkStr = encodeURIComponent(checkStr)
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
  
  // 4. 轉小寫
  checkStr = checkStr.toLowerCase();
  
  // 5. SHA256 加密
  const hash = crypto.createHash('sha256');
  hash.update(checkStr);
  const checkMacValue = hash.digest('hex').toUpperCase();
  
  return checkMacValue;
}

/**
 * 驗證 ECPay 回傳的 CheckMacValue
 * @param {Object} params - 回傳參數
 * @returns {boolean} 驗證結果
 */
export function verifyCheckMacValue(params) {
  const receivedCheckMacValue = params.CheckMacValue;
  delete params.CheckMacValue; // 移除 CheckMacValue 再計算
  
  const calculatedCheckMacValue = generateCheckMacValue(params);
  
  return receivedCheckMacValue === calculatedCheckMacValue;
}

/**
 * 生成交易編號
 * @returns {string} 交易編號
 */
function generateTradeNo() {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `QG${timestamp}${random}`.substring(0, 20); // ECPay 限制 20 字元
}

/**
 * 創建訂閱支付訂單
 * @param {Object} options - 訂單選項
 * @returns {Object} ECPay 支付表單資料
 */
export function createSubscriptionPayment(options) {
  const {
    userId,
    userEmail,
    plan,
    itemName,
  } = options;
  
  const planConfig = SUBSCRIPTION_PLANS[plan];
  if (!planConfig) {
    throw new Error(`Invalid plan: ${plan}`);
  }
  
  const tradeNo = generateTradeNo();
  const tradeDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  // ECPay 基本參數
  const params = {
    MerchantID: ECPAY_CONFIG.merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: planConfig.price,
    TradeDesc: `QuantGem ${planConfig.name}`,
    ItemName: itemName || planConfig.name,
    ReturnURL: ECPAY_CONFIG.returnUrl,
    OrderResultURL: ECPAY_CONFIG.notifyUrl,
    ClientBackURL: ECPAY_CONFIG.returnUrl,
    
    // 付款方式
    ChoosePayment: 'Credit', // 信用卡
    
    // 額外資訊
    CustomField1: userId.toString(), // 用戶 ID
    CustomField2: plan, // 方案 ID
    CustomField3: userEmail,
    CustomField4: 'subscription',
    
    // 是否需要額外的付款資訊
    NeedExtraPaidInfo: 'Y',
  };
  
  // 生成 CheckMacValue
  params.CheckMacValue = generateCheckMacValue(params);
  
  return {
    action: ECPAY_CONFIG.apiUrl,
    params,
    tradeNo,
  };
}

/**
 * 創建單次支付訂單（例如：購買報表、點數等）
 * @param {Object} options - 訂單選項
 * @returns {Object} ECPay 支付表單資料
 */
export function createOneTimePayment(options) {
  const {
    userId,
    userEmail,
    amount,
    itemName,
    description,
  } = options;
  
  const tradeNo = generateTradeNo();
  const tradeDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const params = {
    MerchantID: ECPAY_CONFIG.merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: amount,
    TradeDesc: description || itemName,
    ItemName: itemName,
    ReturnURL: ECPAY_CONFIG.returnUrl,
    OrderResultURL: ECPAY_CONFIG.notifyUrl,
    ClientBackURL: ECPAY_CONFIG.returnUrl,
    ChoosePayment: 'ALL', // 所有付款方式
    CustomField1: userId.toString(),
    CustomField2: 'onetime',
    CustomField3: userEmail,
    NeedExtraPaidInfo: 'Y',
  };
  
  params.CheckMacValue = generateCheckMacValue(params);
  
  return {
    action: ECPAY_CONFIG.apiUrl,
    params,
    tradeNo,
  };
}

/**
 * 處理 ECPay 回調通知
 * @param {Object} notification - ECPay 回傳的通知資料
 * @returns {Object} 處理結果
 */
export function processPaymentNotification(notification) {
  // 驗證 CheckMacValue
  const isValid = verifyCheckMacValue({ ...notification });
  
  if (!isValid) {
    throw new Error('Invalid CheckMacValue');
  }
  
  // 解析支付狀態
  const paymentStatus = notification.RtnCode === '1' ? 'completed' : 'failed';
  
  return {
    isValid,
    paymentStatus,
    tradeNo: notification.MerchantTradeNo,
    ecpayTradeNo: notification.TradeNo,
    amount: parseInt(notification.TradeAmt),
    paymentDate: notification.PaymentDate,
    paymentType: notification.PaymentType,
    userId: notification.CustomField1,
    planId: notification.CustomField2,
    userEmail: notification.CustomField3,
    message: notification.RtnMsg,
  };
}

/**
 * 查詢訂單狀態（需要另外實作查詢 API）
 * @param {string} merchantTradeNo - 商店交易編號
 * @returns {Promise<Object>} 訂單狀態
 */
export async function queryTradeInfo(merchantTradeNo) {
  const params = {
    MerchantID: ECPAY_CONFIG.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: Math.floor(Date.now() / 1000),
  };
  
  params.CheckMacValue = generateCheckMacValue(params);
  
  // 這裡需要實際呼叫 ECPay 查詢 API
  // 由於 ECPay 查詢 API 需要 POST 請求，這裡先返回架構
  
  return {
    params,
    queryUrl: 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
  };
}

/**
 * 生成自動續訂（定期定額）
 * ECPay 定期定額需要另外申請並使用不同的 API
 * @param {Object} options - 續訂選項
 */
export function createPeriodPayment(options) {
  // 定期定額需要使用 ECPay 的定期定額 API
  // 這裡先提供架構，實際需要申請定期定額服務
  
  const {
    userId,
    userEmail,
    plan,
    periodAmount,
    periodType = 'M', // D=天, M=月, Y=年
    frequency = 1,
    execTimes = 12, // 執行次數
  } = options;
  
  const tradeNo = generateTradeNo();
  
  return {
    message: '定期定額需要另外申請 ECPay 定期定額服務',
    tradeNo,
    periodType,
    frequency,
    execTimes,
  };
}

export default {
  SUBSCRIPTION_PLANS,
  createSubscriptionPayment,
  createOneTimePayment,
  processPaymentNotification,
  verifyCheckMacValue,
  queryTradeInfo,
  createPeriodPayment,
};
