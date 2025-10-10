<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuth } from '../stores/auth';

const emit = defineEmits(['change-view']);

const { user, updateProfile, changePassword, loading, fetchCurrentUser } = useAuth();

const activeTab = ref('profile');

const profileForm = ref({
  username: '',
  full_name: '',
  phone: '',
});

const passwordForm = ref({
  current_password: '',
  new_password: '',
  confirm_password: '',
});

const message = ref('');
const messageType = ref(''); // success, error

// 訂閱管理相關狀態
const subscriptions = ref([]);
const payments = ref([]);
const subscriptionLoading = ref(false);
const showCancelModal = ref(false);
const cancelReason = ref('');

const API_BASE = 'http://localhost:3001/api';

const currentSubscription = computed(() => {
  return subscriptions.value.find(s => s.status === 'active');
});

const willAutoRenew = computed(() => {
  return currentSubscription.value?.auto_renew || false;
});

onMounted(async () => {
  await fetchCurrentUser();
  if (user.value) {
    profileForm.value = {
      username: user.value.username || '',
      full_name: user.value.full_name || '',
      phone: user.value.phone || '',
    };
    // 加載訂閱數據
    await Promise.all([
      fetchSubscriptionHistory(),
      fetchPaymentHistory()
    ]);
  }
});

async function handleUpdateProfile() {
  message.value = '';
  
  const result = await updateProfile(profileForm.value);
  
  if (result.success) {
    message.value = '資料更新成功';
    messageType.value = 'success';
  } else {
    message.value = result.error;
    messageType.value = 'error';
  }
  
  setTimeout(() => {
    message.value = '';
  }, 3000);
}

async function handleChangePassword() {
  message.value = '';
  
  if (passwordForm.value.new_password !== passwordForm.value.confirm_password) {
    message.value = '新密碼不一致';
    messageType.value = 'error';
    return;
  }
  
  const result = await changePassword(
    passwordForm.value.current_password,
    passwordForm.value.new_password
  );
  
  if (result.success) {
    message.value = '密碼修改成功';
    messageType.value = 'success';
    passwordForm.value = {
      current_password: '',
      new_password: '',
      confirm_password: '',
    };
  } else {
    message.value = result.error;
    messageType.value = 'error';
  }
  
  setTimeout(() => {
    message.value = '';
  }, 3000);
}

function getPlanBadgeClass(plan) {
  if (plan === 'enterprise') return 'badge-enterprise';
  if (plan === 'pro') return 'badge-pro';
  return 'badge-free';
}

function getPlanLabel(plan) {
  if (plan === 'enterprise') return 'Enterprise';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

function formatDate(dateString) {
  if (!dateString) return '--';
  return new Date(dateString).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatCurrency(amount) {
  return `NT$${amount}`;
}

function getStatusBadgeClass(status) {
  const classes = {
    'active': 'status-active',
    'pending': 'status-pending',
    'cancelled': 'status-cancelled',
    'expired': 'status-expired',
    'completed': 'status-completed',
    'failed': 'status-failed'
  };
  return classes[status] || 'status-default';
}

function getStatusText(status) {
  const texts = {
    'active': '啟用中',
    'pending': '待處理',
    'cancelled': '已取消',
    'expired': '已過期',
    'completed': '已完成',
    'failed': '失敗'
  };
  return texts[status] || status;
}

function getSubscriptionPlanLabel(plan) {
  const labels = {
    'pro': 'Pro 專業版',
    'enterprise': 'Enterprise 企業版'
  };
  return labels[plan] || plan;
}

// 訂閱管理相關函數
async function fetchSubscriptionHistory() {
  subscriptionLoading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/payment/subscription-history`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    if (data.success) {
      subscriptions.value = data.data.subscriptions;
    }
  } catch (error) {
    console.error('Fetch subscriptions error:', error);
  } finally {
    subscriptionLoading.value = false;
  }
}

async function fetchPaymentHistory() {
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/payment/payment-history`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    if (data.success) {
      payments.value = data.data.payments;
    }
  } catch (error) {
    console.error('Fetch payments error:', error);
  }
}

async function handleCancelSubscription() {
  if (!cancelReason.value) {
    alert('請填寫取消原因');
    return;
  }
  
  subscriptionLoading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/payment/cancel-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ reason: cancelReason.value })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('訂閱已取消，將在到期後停止');
      showCancelModal.value = false;
      cancelReason.value = '';
      await fetchSubscriptionHistory();
    } else {
      alert(data.message || '取消失敗');
    }
  } catch (error) {
    console.error('Cancel subscription error:', error);
    alert('取消失敗');
  } finally {
    subscriptionLoading.value = false;
  }
}

async function handleReactivateSubscription() {
  if (!confirm('確定要重新啟用自動續訂嗎？')) {
    return;
  }
  
  subscriptionLoading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/payment/reactivate-subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('訂閱已重新啟用');
      await fetchSubscriptionHistory();
    } else {
      alert(data.message || '重新啟用失敗');
    }
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    alert('重新啟用失敗');
  } finally {
    subscriptionLoading.value = false;
  }
}
</script>

<template>
  <section class="user-profile-section">
    <div class="profile-container">
      <!-- 用戶資訊卡片 -->
      <div class="profile-card profile-overview">
        <div class="profile-avatar">
          <div class="avatar-placeholder">
            <i class="fas fa-user"></i>
          </div>
        </div>
        <div class="profile-info">
          <h2>{{ user?.full_name || user?.username || user?.email }}</h2>
          <p class="profile-email">{{ user?.email }}</p>
          <div class="profile-badges">
            <span class="plan-badge" :class="getPlanBadgeClass(user?.plan)">
              <i class="fas fa-crown"></i>
              {{ getPlanLabel(user?.plan) }}
            </span>
            <span v-if="user?.email_verified" class="verified-badge">
              <i class="fas fa-check-circle"></i>
              已驗證
            </span>
          </div>
        </div>
      </div>
      
      <!-- 訂閱資訊卡片 -->
      <div class="profile-card subscription-card">
        <h3><i class="fas fa-credit-card"></i> 訂閱資訊</h3>
        <div class="subscription-details">
          <div class="detail-row">
            <span class="detail-label">當前方案</span>
            <span class="detail-value">{{ getPlanLabel(user?.plan) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">訂閱狀態</span>
            <span class="detail-value">{{ user?.subscription_status === 'active' ? '啟用中' : '未訂閱' }}</span>
          </div>
          <div v-if="user?.subscription_end_date" class="detail-row">
            <span class="detail-label">到期日</span>
            <span class="detail-value">{{ formatDate(user?.subscription_end_date) }}</span>
          </div>
        </div>
        <button v-if="user?.plan === 'free'" class="btn-upgrade" @click="emit('change-view', 'pricing')">
          <i class="fas fa-arrow-up"></i> 升級至 Pro
        </button>
      </div>
      
      <!-- 使用統計卡片 -->
      <div class="profile-card usage-card">
        <h3><i class="fas fa-chart-bar"></i> 使用統計</h3>
        <div class="usage-stats">
          <div class="stat-item">
            <div class="stat-label">比較工具</div>
            <div class="stat-value">
              {{ user?.usage_limits?.comparison_count || 0 }} / 
              {{ user?.plan === 'free' ? user?.usage_limits?.comparison_limit || 3 : '∞' }}
            </div>
            <div class="stat-bar">
              <div 
                class="stat-bar-fill" 
                :style="{ width: user?.plan === 'free' ? `${(user?.usage_limits?.comparison_count || 0) / (user?.usage_limits?.comparison_limit || 3) * 100}%` : '0%' }"
              ></div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">警示規則</div>
            <div class="stat-value">
              {{ user?.usage_limits?.alert_count || 0 }} / 
              {{ user?.plan === 'free' ? user?.usage_limits?.alert_limit || 3 : '∞' }}
            </div>
            <div class="stat-bar">
              <div 
                class="stat-bar-fill" 
                :style="{ width: user?.plan === 'free' ? `${(user?.usage_limits?.alert_count || 0) / (user?.usage_limits?.alert_limit || 3) * 100}%` : '0%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 設定標籤頁 -->
      <div class="profile-card settings-card">
        <div class="tabs">
          <button 
            class="tab" 
            :class="{ active: activeTab === 'profile' }"
            @click="activeTab = 'profile'"
          >
            <i class="fas fa-user-edit"></i> 個人資料
          </button>
          <button 
            class="tab" 
            :class="{ active: activeTab === 'password' }"
            @click="activeTab = 'password'"
          >
            <i class="fas fa-key"></i> 修改密碼
          </button>
          <button 
            class="tab" 
            :class="{ active: activeTab === 'subscription' }"
            @click="activeTab = 'subscription'"
          >
            <i class="fas fa-credit-card"></i> 訂閱管理
          </button>
        </div>
        
        <div v-if="message" class="alert" :class="`alert--${messageType}`">
          <i class="fas" :class="messageType === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'"></i>
          {{ message }}
        </div>
        
        <!-- 個人資料表單 -->
        <div v-show="activeTab === 'profile'" class="tab-content">
          <form @submit.prevent="handleUpdateProfile" class="settings-form">
            <div class="form-field">
              <label>用戶名稱</label>
              <input v-model="profileForm.username" type="text" class="filter-input" />
            </div>
            <div class="form-field">
              <label>姓名</label>
              <input v-model="profileForm.full_name" type="text" class="filter-input" />
            </div>
            <div class="form-field">
              <label>電話</label>
              <input v-model="profileForm.phone" type="tel" class="filter-input" />
            </div>
            <button type="submit" class="btn-primary" :disabled="loading">
              <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-save'"></i>
              {{ loading ? '儲存中...' : '儲存變更' }}
            </button>
          </form>
        </div>
        
        <!-- 修改密碼表單 -->
        <div v-show="activeTab === 'password'" class="tab-content">
          <form @submit.prevent="handleChangePassword" class="settings-form">
            <div class="form-field">
              <label>當前密碼</label>
              <input v-model="passwordForm.current_password" type="password" class="filter-input" required />
            </div>
            <div class="form-field">
              <label>新密碼</label>
              <input v-model="passwordForm.new_password" type="password" class="filter-input" required />
              <small class="form-hint">至少 6 個字元</small>
            </div>
            <div class="form-field">
              <label>確認新密碼</label>
              <input v-model="passwordForm.confirm_password" type="password" class="filter-input" required />
            </div>
            <button type="submit" class="btn-primary" :disabled="loading">
              <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-key'"></i>
              {{ loading ? '修改中...' : '修改密碼' }}
            </button>
          </form>
        </div>
        
        <!-- 訂閱管理標籤頁 -->
        <div v-show="activeTab === 'subscription'" class="tab-content subscription-tab">
          <!-- 當前訂閱狀態 -->
          <div v-if="currentSubscription" class="current-subscription-card">
            <div class="subscription-header">
              <div>
                <h3>{{ getSubscriptionPlanLabel(currentSubscription.plan) }}</h3>
                <span class="status-badge" :class="getStatusBadgeClass(currentSubscription.status)">
                  {{ getStatusText(currentSubscription.status) }}
                </span>
              </div>
              <div class="subscription-price">
                {{ formatCurrency(currentSubscription.amount) }}/月
              </div>
            </div>
            
            <div class="subscription-details">
              <div class="detail-row">
                <span class="detail-label">開始日期</span>
                <span class="detail-value">{{ formatDate(currentSubscription.start_date) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">到期日期</span>
                <span class="detail-value">{{ formatDate(currentSubscription.end_date) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">自動續訂</span>
                <span class="detail-value">
                  <span v-if="willAutoRenew" class="status-active">✓ 啟用</span>
                  <span v-else class="status-cancelled">✗ 已停用</span>
                </span>
              </div>
            </div>
            
            <div class="subscription-actions">
              <button 
                v-if="willAutoRenew" 
                class="btn-cancel"
                @click="showCancelModal = true"
              >
                <i class="fas fa-times-circle"></i> 取消訂閱
              </button>
              <button 
                v-else 
                class="btn-reactivate"
                @click="handleReactivateSubscription"
              >
                <i class="fas fa-redo"></i> 重新啟用
              </button>
            </div>
          </div>
          
          <div v-else class="no-subscription">
            <i class="fas fa-inbox"></i>
            <p>您目前沒有活躍的訂閱</p>
            <button class="btn-subscribe" @click="emit('change-view', 'pricing')">
              <i class="fas fa-arrow-up"></i> 查看訂閱方案
            </button>
          </div>
          
          <!-- 訂閱歷史 -->
          <div class="history-section">
            <h4><i class="fas fa-history"></i> 訂閱歷史</h4>
            <div v-if="subscriptions.length > 0" class="history-table">
              <table>
                <thead>
                  <tr>
                    <th>方案</th>
                    <th>金額</th>
                    <th>開始日期</th>
                    <th>結束日期</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="subscription in subscriptions" :key="subscription.id">
                    <td>{{ getSubscriptionPlanLabel(subscription.plan) }}</td>
                    <td>{{ formatCurrency(subscription.amount) }}</td>
                    <td>{{ formatDate(subscription.start_date) }}</td>
                    <td>{{ formatDate(subscription.end_date) }}</td>
                    <td>
                      <span class="status-badge" :class="getStatusBadgeClass(subscription.status)">
                        {{ getStatusText(subscription.status) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-state">
              <p>暫無訂閱記錄</p>
            </div>
          </div>
          
          <!-- 支付歷史 -->
          <div class="history-section">
            <h4><i class="fas fa-receipt"></i> 支付歷史</h4>
            <div v-if="payments.length > 0" class="history-table">
              <table>
                <thead>
                  <tr>
                    <th>方案</th>
                    <th>金額</th>
                    <th>付款方式</th>
                    <th>交易時間</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="payment in payments" :key="payment.id">
                    <td>{{ payment.plan ? getSubscriptionPlanLabel(payment.plan) : '--' }}</td>
                    <td>{{ formatCurrency(payment.amount) }}</td>
                    <td>{{ payment.payment_method || '--' }}</td>
                    <td>{{ formatDate(payment.paid_at || payment.created_at) }}</td>
                    <td>
                      <span class="status-badge" :class="getStatusBadgeClass(payment.status)">
                        {{ getStatusText(payment.status) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-state">
              <p>暫無支付記錄</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 取消訂閱模態框 -->
    <div v-if="showCancelModal" class="modal-overlay" @click.self="showCancelModal = false">
      <div class="cancel-modal">
        <button class="modal-close" @click="showCancelModal = false">
          <i class="fas fa-times"></i>
        </button>
        
        <div class="modal-content">
          <div class="modal-icon modal-icon-warning">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          
          <h3>確定要取消訂閱嗎？</h3>
          <p>取消後，您的訂閱將在 <strong>{{ formatDate(currentSubscription?.end_date) }}</strong> 到期後停止。</p>
          <p>到期前您仍可以使用所有功能。</p>
          
          <div class="form-field">
            <label>取消原因（必填）</label>
            <textarea 
              v-model="cancelReason" 
              class="filter-input" 
              rows="3"
              placeholder="請告訴我們取消的原因，幫助我們改進服務"
            ></textarea>
          </div>
          
          <div class="modal-actions">
            <button class="btn-secondary" @click="showCancelModal = false">
              返回
            </button>
            <button 
              class="btn-danger" 
              :disabled="subscriptionLoading || !cancelReason"
              @click="handleCancelSubscription"
            >
              <i class="fas" :class="subscriptionLoading ? 'fa-spinner fa-spin' : 'fa-check'"></i>
              {{ subscriptionLoading ? '處理中...' : '確認取消' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
