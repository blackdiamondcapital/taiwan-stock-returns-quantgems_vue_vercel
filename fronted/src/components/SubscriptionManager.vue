<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuth } from '../stores/auth';

const { user, fetchCurrentUser } = useAuth();

const subscriptions = ref([]);
const payments = ref([]);
const loading = ref(false);
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
  await Promise.all([
    fetchSubscriptionHistory(),
    fetchPaymentHistory()
  ]);
});

async function fetchSubscriptionHistory() {
  loading.value = true;
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
    loading.value = false;
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
  
  loading.value = true;
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
    loading.value = false;
  }
}

async function handleReactivateSubscription() {
  if (!confirm('確定要重新啟用自動續訂嗎？')) {
    return;
  }
  
  loading.value = true;
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
    loading.value = false;
  }
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

function getPlanLabel(plan) {
  const labels = {
    'pro': 'Pro 專業版',
    'enterprise': 'Enterprise 企業版'
  };
  return labels[plan] || plan;
}
</script>

<template>
  <section class="subscription-manager">
    <div class="manager-container">
      <h2><i class="fas fa-credit-card"></i> 訂閱管理</h2>
      
      <!-- 當前訂閱狀態 -->
      <div v-if="currentSubscription" class="current-subscription-card">
        <div class="subscription-header">
          <div>
            <h3>{{ getPlanLabel(currentSubscription.plan) }}</h3>
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
        <router-link to="/pricing" class="btn-subscribe">
          <i class="fas fa-arrow-up"></i> 查看訂閱方案
        </router-link>
      </div>
      
      <!-- 訂閱歷史 -->
      <div class="history-section">
        <h3><i class="fas fa-history"></i> 訂閱歷史</h3>
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
                <td>{{ getPlanLabel(subscription.plan) }}</td>
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
        <h3><i class="fas fa-receipt"></i> 支付歷史</h3>
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
                <td>{{ payment.plan ? getPlanLabel(payment.plan) : '--' }}</td>
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
              :disabled="loading || !cancelReason"
              @click="handleCancelSubscription"
            >
              <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-check'"></i>
              {{ loading ? '處理中...' : '確認取消' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
