<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuth } from '../stores/auth';

const { isAuthenticated, user } = useAuth();

const plans = ref([]);
const loading = ref(false);
const selectedPlan = ref(null);
const showPaymentModal = ref(false);
const paymentForm = ref(null);

// API Base URL
const API_BASE = 'http://localhost:3001/api';

onMounted(async () => {
  await fetchPlans();
});

async function fetchPlans() {
  loading.value = true;
  try {
    const response = await fetch(`${API_BASE}/payment/plans`);
    const data = await response.json();
    
    if (data.success) {
      plans.value = data.data.plans;
    }
  } catch (error) {
    console.error('Fetch plans error:', error);
  } finally {
    loading.value = false;
  }
}

function getPlanBadgeClass(planId) {
  if (planId === 'enterprise') return 'plan-badge-enterprise';
  if (planId === 'pro') return 'plan-badge-pro';
  return 'plan-badge-free';
}

function canUpgrade(planId) {
  if (!user.value) return true;
  const planLevels = { free: 0, pro: 1, enterprise: 2 };
  return planLevels[user.value.plan] < planLevels[planId];
}

async function handleSubscribe(plan) {
  if (!isAuthenticated.value) {
    alert('請先登入');
    return;
  }
  
  if (!canUpgrade(plan.id)) {
    alert('您已經擁有此方案或更高級別的方案');
    return;
  }
  
  loading.value = true;
  selectedPlan.value = plan;
  
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/payment/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ plan: plan.id })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // 顯示支付表單
      paymentForm.value = data.data.paymentData;
      showPaymentModal.value = true;
      
      // 延遲提交表單，讓用戶看到資訊
      setTimeout(() => {
        document.getElementById('ecpay-form').submit();
      }, 1500);
    } else {
      alert(data.message || '訂閱失敗');
    }
  } catch (error) {
    console.error('Subscribe error:', error);
    alert('訂閱失敗，請稍後再試');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="pricing-section">
    <div class="pricing-container">
      <!-- 標題區域 -->
      <div class="pricing-header">
        <h1>選擇適合您的方案</h1>
        <p>升級至 Pro 或 Enterprise 方案，解鎖更多強大功能</p>
      </div>
      
      <div class="plans-grid">
        <!-- 免費方案卡片 -->
        <div class="plan-card plan-card-free">
          <div class="plan-badge" :class="getPlanBadgeClass('free')">
            <i class="fas fa-rocket"></i>
            Free
          </div>
          <h2>免費版</h2>
          <div class="plan-price">
            <span class="price-amount">NT$0</span>
            <span class="price-period">/月</span>
          </div>
          <p class="plan-description">開始您的投資追蹤之旅</p>
          
          <ul class="plan-features">
            <li><i class="fas fa-check"></i> 查看基本排行榜（前 20 名）</li>
            <li><i class="fas fa-check"></i> 每日報酬數據</li>
            <li><i class="fas fa-check"></i> 比較最多 3 支股票</li>
            <li><i class="fas fa-check"></i> 基本警示（最多 3 條規則）</li>
            <li class="feature-disabled"><i class="fas fa-times"></i> 無資料匯出</li>
            <li class="feature-disabled"><i class="fas fa-times"></i> 無歷史數據</li>
          </ul>
          
          <button 
            v-if="user?.plan === 'free' || !isAuthenticated" 
            class="btn-plan btn-plan-current" 
            disabled
          >
            <i class="fas fa-check-circle"></i>
            {{ isAuthenticated ? '當前方案' : '免費使用' }}
          </button>
        </div>
        
        <!-- 訂閱方案卡片 -->
        <div v-for="plan in plans" :key="plan.id" class="plan-card" :class="`plan-card-${plan.id}`">
          <div v-if="plan.id === 'pro'" class="plan-recommended">
            <i class="fas fa-star"></i> 推薦
          </div>
          
          <div class="plan-badge" :class="getPlanBadgeClass(plan.id)">
            <i class="fas" :class="plan.id === 'enterprise' ? 'fa-crown' : 'fa-bolt'"></i>
            {{ plan.id === 'enterprise' ? 'Enterprise' : 'Pro' }}
          </div>
          
          <h2>{{ plan.name }}</h2>
          
          <div class="plan-price">
            <span class="price-amount">NT${{ plan.price }}</span>
            <span class="price-period">/月</span>
          </div>
          
          <p class="plan-description">
            {{ plan.id === 'enterprise' ? '企業級專業解決方案' : '適合認真投資者' }}
          </p>
          
          <ul class="plan-features">
            <li v-for="feature in plan.features" :key="feature">
              <i class="fas fa-check"></i> {{ feature }}
            </li>
          </ul>
          
          <button 
            v-if="user?.plan === plan.id"
            class="btn-plan btn-plan-current" 
            disabled
          >
            <i class="fas fa-check-circle"></i> 當前方案
          </button>
          <button 
            v-else-if="canUpgrade(plan.id)"
            class="btn-plan btn-plan-subscribe" 
            :disabled="loading"
            @click="handleSubscribe(plan)"
          >
            <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-arrow-up'"></i>
            {{ loading ? '處理中...' : '立即訂閱' }}
          </button>
          <button 
            v-else
            class="btn-plan btn-plan-downgrade" 
            disabled
          >
            <i class="fas fa-lock"></i> 已擁有更高方案
          </button>
        </div>
      </div>
      
      <!-- 功能對比表 -->
      <div class="comparison-section">
        <h3>方案功能對比</h3>
        <div class="comparison-table">
          <table>
            <thead>
              <tr>
                <th>功能</th>
                <th>Free</th>
                <th>Pro</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>排行榜查看</td>
                <td>前 20 名</td>
                <td>✓ 無限制</td>
                <td>✓ 無限制</td>
              </tr>
              <tr>
                <td>股票比較</td>
                <td>最多 3 支</td>
                <td>✓ 無限制</td>
                <td>✓ 無限制</td>
              </tr>
              <tr>
                <td>警示規則</td>
                <td>最多 3 條</td>
                <td>✓ 無限制</td>
                <td>✓ 無限制</td>
              </tr>
              <tr>
                <td>資料匯出</td>
                <td>✗</td>
                <td>10 次/天</td>
                <td>✓ 無限制</td>
              </tr>
              <tr>
                <td>歷史數據回測</td>
                <td>✗</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>API 存取</td>
                <td>✗</td>
                <td>✗</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>即時推播</td>
                <td>✗</td>
                <td>✗</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>客服支援</td>
                <td>社群</td>
                <td>Email</td>
                <td>專屬經理</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- 常見問題 -->
      <div class="faq-section">
        <h3>常見問題</h3>
        <div class="faq-grid">
          <div class="faq-item">
            <h4><i class="fas fa-question-circle"></i> 可以隨時取消嗎？</h4>
            <p>是的，您可以隨時取消訂閱。訂閱將在當前付費週期結束後停止。</p>
          </div>
          <div class="faq-item">
            <h4><i class="fas fa-question-circle"></i> 支援哪些付款方式？</h4>
            <p>我們支援信用卡、ATM 轉帳、超商代碼等多種付款方式。</p>
          </div>
          <div class="faq-item">
            <h4><i class="fas fa-question-circle"></i> 可以升級或降級方案嗎？</h4>
            <p>可以，您可以隨時升級方案。降級將在下一個付費週期生效。</p>
          </div>
          <div class="faq-item">
            <h4><i class="fas fa-question-circle"></i> 有試用期嗎？</h4>
            <p>新用戶可享有 7 天免費試用期，無需綁定信用卡。</p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- ECPay 支付表單（隱藏，自動提交） -->
    <div v-if="showPaymentModal" class="payment-modal">
      <div class="payment-modal-content">
        <div class="payment-loading">
          <div class="spinner"></div>
          <h3>正在前往付款頁面...</h3>
          <p>請稍候，即將跳轉至綠界支付</p>
        </div>
        
        <form 
          v-if="paymentForm" 
          id="ecpay-form" 
          :action="paymentForm.action" 
          method="post"
          style="display: none;"
        >
          <input 
            v-for="(value, key) in paymentForm.params" 
            :key="key"
            type="hidden" 
            :name="key" 
            :value="value"
          />
        </form>
      </div>
    </div>
  </section>
</template>
