<script setup>
import { ref, onMounted } from 'vue';
import { useAuth } from '../stores/auth';

const { user } = useAuth();

const API_BASE = 'http://localhost:3001/api';

const loading = ref(false);
const message = ref('');
const messageType = ref('');

// Email settings
const emailSettings = ref({
  email: '',
  enabled: false,
  frequency: 'batch_5min',
});

const frequencyOptions = [
  { value: 'immediate', label: '即時通知', desc: '每個警示立即發送 (可能會收到很多郵件)' },
  { value: 'batch_5min', label: '5分鐘批次', desc: '每 5 分鐘整合成一封郵件發送 (推薦)' },
  { value: 'batch_15min', label: '15分鐘批次', desc: '每 15 分鐘整合成一封郵件發送' },
  { value: 'batch_1hour', label: '1小時批次', desc: '每小時整合成一封郵件發送' },
  { value: 'daily', label: '每日摘要', desc: '每天發送一次所有警示摘要' },
];

// LINE settings
const lineSettings = ref({
  token: '',
  enabled: false,
  hasToken: false,
});

const showLineTokenInput = ref(false);

async function loadNotificationSettings() {
  loading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/notifications/settings`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    if (data.success) {
      emailSettings.value.email = data.data.email || '';
      emailSettings.value.enabled = data.data.emailEnabled || false;
      emailSettings.value.frequency = data.data.notificationFrequency || 'batch_5min';
      lineSettings.value.enabled = data.data.lineNotifyEnabled || false;
      lineSettings.value.hasToken = data.data.hasLineToken || false;
    }
  } catch (error) {
    console.error('Load notification settings error:', error);
  } finally {
    loading.value = false;
  }
}

async function saveEmailSettings() {
  if (!emailSettings.value.email || !emailSettings.value.email.includes('@')) {
    showMessage('請輸入有效的 Email 地址', 'error');
    return;
  }

  loading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/notifications/email/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        email: emailSettings.value.email,
        enabled: emailSettings.value.enabled,
        frequency: emailSettings.value.frequency
      })
    });
    
    const data = await response.json();
    if (data.success) {
      showMessage('Email 設定已儲存', 'success');
    } else {
      showMessage(data.message || '儲存失敗', 'error');
    }
  } catch (error) {
    console.error('Save email settings error:', error);
    showMessage('儲存失敗', 'error');
  } finally {
    loading.value = false;
  }
}

async function testEmail() {
  loading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/notifications/email/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    if (data.success) {
      showMessage('測試郵件已發送，請檢查收件匣', 'success');
    } else {
      showMessage(data.message || '發送失敗', 'error');
    }
  } catch (error) {
    console.error('Test email error:', error);
    showMessage('發送失敗', 'error');
  } finally {
    loading.value = false;
  }
}

async function saveLINESettings() {
  if (!lineSettings.value.token && !lineSettings.value.hasToken) {
    showMessage('請輸入 LINE Notify Token', 'error');
    return;
  }

  loading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/notifications/line/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        token: lineSettings.value.token || 'existing',
        enabled: lineSettings.value.enabled
      })
    });
    
    const data = await response.json();
    if (data.success) {
      showMessage('LINE 設定已儲存', 'success');
      showLineTokenInput.value = false;
      lineSettings.value.hasToken = true;
      lineSettings.value.token = '';
      await loadNotificationSettings();
    } else {
      showMessage(data.message || '儲存失敗', 'error');
    }
  } catch (error) {
    console.error('Save LINE settings error:', error);
    showMessage('儲存失敗', 'error');
  } finally {
    loading.value = false;
  }
}

async function testLINE() {
  loading.value = true;
  try {
    const token = localStorage.getItem('quantgem_auth_token');
    const response = await fetch(`${API_BASE}/notifications/line/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    if (data.success) {
      showMessage('測試訊息已發送至 LINE', 'success');
    } else {
      showMessage(data.message || '發送失敗', 'error');
    }
  } catch (error) {
    console.error('Test LINE error:', error);
    showMessage('發送失敗', 'error');
  } finally {
    loading.value = false;
  }
}

function showMessage(msg, type) {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

onMounted(() => {
  loadNotificationSettings();
});
</script>

<template>
  <div class="notification-settings">
    <h3><i class="fas fa-paper-plane"></i> 通知設定</h3>
    
    <div v-if="message" class="alert" :class="`alert--${messageType}`">
      <i class="fas" :class="messageType === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'"></i>
      {{ message }}
    </div>

    <!-- Email 通知設定 -->
    <div class="notification-card">
      <div class="notification-header">
        <div class="notification-icon email-icon">
          <i class="fas fa-envelope"></i>
        </div>
        <div>
          <h4>📧 Email 通知</h4>
          <p class="notification-description">當警示觸發時，系統會發送郵件通知到您的信箱</p>
        </div>
      </div>
      
      <div class="notification-body">
        <div class="form-field">
          <label>Email 地址</label>
          <input 
            v-model="emailSettings.email" 
            type="email" 
            class="filter-input" 
            placeholder="example@email.com"
            :disabled="loading"
          />
        </div>
        
        <div class="form-field">
          <label>通知頻率</label>
          <select 
            v-model="emailSettings.frequency" 
            class="filter-input"
            :disabled="loading"
          >
            <option v-for="opt in frequencyOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <small class="form-hint">
            {{ frequencyOptions.find(o => o.value === emailSettings.frequency)?.desc }}
          </small>
        </div>
        
        <div class="form-field-checkbox">
          <label>
            <input 
              v-model="emailSettings.enabled" 
              type="checkbox" 
              :disabled="loading"
            />
            <span>啟用 Email 通知</span>
          </label>
        </div>
        
        <div class="notification-actions">
          <button 
            class="btn-primary" 
            @click="saveEmailSettings" 
            :disabled="loading"
          >
            <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-save'"></i>
            儲存設定
          </button>
          <button 
            class="btn-secondary" 
            @click="testEmail" 
            :disabled="loading || !emailSettings.email"
          >
            <i class="fas fa-paper-plane"></i>
            發送測試郵件
          </button>
        </div>
      </div>
    </div>

    <!-- LINE Notify 設定 -->
    <div class="notification-card">
      <div class="notification-header">
        <div class="notification-icon line-icon">
          <i class="fab fa-line"></i>
        </div>
        <div>
          <h4>💬 LINE Notify</h4>
          <p class="notification-description">透過 LINE 接收即時警示通知</p>
        </div>
      </div>
      
      <div class="notification-body">
        <div v-if="lineSettings.hasToken && !showLineTokenInput" class="line-status">
          <div class="status-badge status-active">
            <i class="fas fa-check-circle"></i>
            已連結 LINE Notify
          </div>
          <button 
            class="btn-link" 
            @click="showLineTokenInput = true"
          >
            更換 Token
          </button>
        </div>
        
        <div v-if="!lineSettings.hasToken || showLineTokenInput">
          <div class="form-field">
            <label>LINE Notify Token</label>
            <input 
              v-model="lineSettings.token" 
              type="text" 
              class="filter-input" 
              placeholder="貼上您的 LINE Notify Token"
              :disabled="loading"
            />
            <small class="form-hint">
              <a href="https://notify-bot.line.me/my/" target="_blank" rel="noopener">
                點此取得 LINE Notify Token
              </a>
            </small>
          </div>
        </div>
        
        <div class="form-field-checkbox">
          <label>
            <input 
              v-model="lineSettings.enabled" 
              type="checkbox" 
              :disabled="loading"
            />
            <span>啟用 LINE 通知</span>
          </label>
        </div>
        
        <div class="notification-actions">
          <button 
            class="btn-primary" 
            @click="saveLINESettings" 
            :disabled="loading"
          >
            <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-save'"></i>
            儲存設定
          </button>
          <button 
            class="btn-secondary" 
            @click="testLINE" 
            :disabled="loading || !lineSettings.hasToken"
          >
            <i class="fas fa-paper-plane"></i>
            發送測試訊息
          </button>
        </div>
      </div>
    </div>

    <!-- 說明區塊 -->
    <div class="notification-info">
      <h4><i class="fas fa-info-circle"></i> 使用說明</h4>
      <ul>
        <li><strong>Email 通知：</strong>需要設定有效的 Email 地址並啟用功能</li>
        <li><strong>LINE 通知：</strong>需要先取得 LINE Notify Token，請至 
          <a href="https://notify-bot.line.me/my/" target="_blank" rel="noopener">LINE Notify 官網</a> 
          申請
        </li>
        <li>設定完成後，可點擊「發送測試」按鈕確認通知是否正常</li>
        <li>警示觸發時會同時發送到已啟用的所有通知管道</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.notification-settings {
  max-width: 800px;
  margin: 0 auto;
}

.notification-settings > h3 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.notification-settings > h3 i {
  color: #00d4ff;
  filter: drop-shadow(0 0 12px rgba(0, 212, 255, 0.5));
}

.alert {
  padding: 1rem 1.25rem;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.95rem;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.alert--success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.alert--error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.notification-card {
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85));
  border: 1px solid rgba(99, 179, 237, 0.2);
  border-radius: 20px;
  padding: 1.75rem;
  margin-bottom: 1.5rem;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.notification-header {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(99, 179, 237, 0.1);
}

.notification-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  flex-shrink: 0;
}

.email-icon {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.15));
  color: #3b82f6;
  border: 2px solid rgba(59, 130, 246, 0.3);
}

.line-icon {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.15));
  color: #22c55e;
  border: 2px solid rgba(34, 197, 94, 0.3);
}

.notification-header h4 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem 0;
}

.notification-description {
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.9rem;
  margin: 0;
}

.notification-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.notification-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.line-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.btn-link {
  background: none;
  border: none;
  color: #00d4ff;
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
  transition: opacity 0.3s ease;
}

.btn-link:hover {
  opacity: 0.8;
}

.notification-info {
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85));
  border: 1px solid rgba(99, 179, 237, 0.2);
  border-radius: 20px;
  padding: 1.75rem;
}

.notification-info h4 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.notification-info h4 i {
  color: #00d4ff;
}

.notification-info ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.notification-info li {
  color: rgba(226, 232, 240, 0.8);
  font-size: 0.95rem;
  line-height: 1.8;
  padding-left: 1.5rem;
  position: relative;
}

.notification-info li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: #00d4ff;
  font-weight: bold;
}

.notification-info a {
  color: #00d4ff;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.3s ease;
}

.notification-info a:hover {
  border-bottom-color: #00d4ff;
}
</style>
