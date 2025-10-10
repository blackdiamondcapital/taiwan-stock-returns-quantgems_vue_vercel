<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { httpGet } from '../services/api'
import NotificationSettings from './NotificationSettings.vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
})

const STORAGE_KEY_ALERTS = 'quantgem_alerts'
const STORAGE_KEY_HISTORY = 'quantgem_alert_history'
const STORAGE_KEY_NOTIFY = 'quantgem_notify_enabled'

const newAlert = reactive({
  symbol: '',
  type: 'price',
  operator: '>=',
  threshold: null,
})

const alerts = ref([])
const alertHistory = ref([])
const notifyEnabled = ref(false)
const checkInterval = ref(null)
const showNotificationSettings = ref(false)

const API_BASE = 'http://localhost:3001/api'

const alertTypes = [
  { value: 'price', label: '價格突破', unit: 'NT$' },
  { value: 'return', label: '報酬率', unit: '%' },
  { value: 'volume', label: '成交量異常', unit: '倍' },
  { value: 'volatility', label: '波動率', unit: '%' },
]

const operators = [
  { value: '>=', label: '向上突破 ▲', symbol: '≥' },
  { value: '<=', label: '向下跌破 ▼', symbol: '≤' },
]

function loadAlerts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ALERTS)
    if (saved) {
      alerts.value = JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load alerts:', e)
  }
}

function saveAlerts() {
  try {
    localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(alerts.value))
  } catch (e) {
    console.error('Failed to save alerts:', e)
  }
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_HISTORY)
    if (saved) {
      alertHistory.value = JSON.parse(saved).slice(0, 100)
    }
  } catch (e) {
    console.error('Failed to load history:', e)
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(alertHistory.value.slice(0, 100)))
  } catch (e) {
    console.error('Failed to save history:', e)
  }
}

function loadNotifyPreference() {
  const saved = localStorage.getItem(STORAGE_KEY_NOTIFY)
  notifyEnabled.value = saved === 'true'
}

function saveNotifyPreference() {
  localStorage.setItem(STORAGE_KEY_NOTIFY, notifyEnabled.value.toString())
}

function createAlert() {
  if (!newAlert.threshold || isNaN(newAlert.threshold)) {
    alert('請輸入有效的閾值')
    return
  }

  const alert = {
    id: Date.now().toString(),
    symbol: newAlert.symbol.trim().toUpperCase() || null,
    type: newAlert.type,
    operator: newAlert.operator,
    threshold: Number(newAlert.threshold),
    active: true,
    createdAt: new Date().toISOString(),
    triggeredCount: 0,
  }

  alerts.value.push(alert)
  saveAlerts()

  // Reset form
  newAlert.symbol = ''
  newAlert.threshold = null
}

function toggleAlert(id) {
  const alert = alerts.value.find(a => a.id === id)
  if (alert) {
    alert.active = !alert.active
    saveAlerts()
  }
}

function deleteAlert(id) {
  alerts.value = alerts.value.filter(a => a.id !== id)
  saveAlerts()
}

function clearHistory() {
  if (confirm('確定要清空所有警示記錄嗎？')) {
    alertHistory.value = []
    saveHistory()
  }
}

function exportHistory() {
  const data = JSON.stringify(alertHistory.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `alert-history-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function getAlertDescription(alert) {
  const typeLabel = alertTypes.find(t => t.value === alert.type)?.label || alert.type
  const opLabel = operators.find(o => o.value === alert.operator)?.symbol || alert.operator
  const unit = alertTypes.find(t => t.value === alert.type)?.unit || ''
  const symbol = alert.symbol || '所有股票'
  
  return `${symbol} ${typeLabel} ${opLabel} ${alert.threshold}${unit}`
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        notifyEnabled.value = true
        saveNotifyPreference()
      }
    })
  } else if (Notification.permission === 'granted') {
    notifyEnabled.value = true
    saveNotifyPreference()
  }
}

function sendNotification(title, message) {
  if (!notifyEnabled.value || Notification.permission !== 'granted') return

  const notification = new Notification(title, {
    body: message,
    icon: '/favicon.ico',
    tag: 'quantgem-alert',
    requireInteraction: true,
  })

  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}

async function sendBackendNotification(alertData) {
  try {
    const token = localStorage.getItem('quantgem_auth_token')
    if (!token) return

    await fetch(`${API_BASE}/notifications/send-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ alertData })
    })
  } catch (error) {
    console.error('Send backend notification error:', error)
  }
}

function checkAlerts() {
  if (!props.rows || !props.rows.length) return

  const now = new Date()
  
  alerts.value.forEach(alert => {
    if (!alert.active) return

    const matchingRows = alert.symbol 
      ? props.rows.filter(row => {
          const normalized = String(row.symbol || '').toUpperCase().replace(/\.(TW|TWO)$/i, '')
          const targetNormalized = alert.symbol.replace(/\.(TW|TWO)$/i, '')
          return normalized === targetNormalized
        })
      : props.rows

    matchingRows.forEach(row => {
      let value = null
      let displayValue = null

      if (alert.type === 'price') {
        value = row.price || row.current_price || row.close_price || row.latest_close
      } else if (alert.type === 'return') {
        value = row.returnRate || row.return_rate || row.return || row.latest_return_pct
      } else if (alert.type === 'volume') {
        value = row.volume || row.latest_volume
      } else if (alert.type === 'volatility') {
        value = row.volatility || row.stddev
      }

      if (value === null || value === undefined) return

      value = Number(value)
      if (!Number.isFinite(value)) return

      let triggered = false
      if (alert.operator === '>=' && value >= alert.threshold) {
        triggered = true
      } else if (alert.operator === '<=' && value <= alert.threshold) {
        triggered = true
      }

      if (triggered) {
        const symbol = row.symbol || row.ticker || 'Unknown'
        const name = row.short_name || row.name || ''
        
        const typeLabel = alertTypes.find(t => t.value === alert.type)?.label || alert.type
        const unit = alertTypes.find(t => t.value === alert.type)?.unit || ''
        
        if (alert.type === 'return') {
          displayValue = `${value.toFixed(2)}${unit}`
        } else if (alert.type === 'price') {
          displayValue = `${unit}${value.toFixed(2)}`
        } else {
          displayValue = `${value.toFixed(2)}${unit}`
        }

        const message = `${symbol} ${name} ${typeLabel}: ${displayValue}`
        const direction = alert.operator === '>=' ? '▲' : '▼'
        
        const historyItem = {
          id: `${alert.id}-${symbol}-${now.getTime()}`,
          alertId: alert.id,
          symbol,
          name,
          type: alert.type,
          value: displayValue,
          threshold: `${alert.threshold}${unit}`,
          direction,
          message,
          timestamp: now.toISOString(),
        }

        // Check if already triggered recently (within 5 minutes)
        const recentDuplicate = alertHistory.value.find(h => 
          h.alertId === alert.id && 
          h.symbol === symbol && 
          (now - new Date(h.timestamp)) < 5 * 60 * 1000
        )

        if (!recentDuplicate) {
          alertHistory.value.unshift(historyItem)
          alertHistory.value = alertHistory.value.slice(0, 100)
          saveHistory()

          alert.triggeredCount = (alert.triggeredCount || 0) + 1
          saveAlerts()

          sendNotification(`🔔 ${typeLabel}警示`, message)
          
          // Send to backend for Email/LINE notifications
          sendBackendNotification({
            title: `${typeLabel}警示`,
            symbol,
            name,
            type: typeLabel,
            condition: getAlertDescription(alert),
            message: displayValue,
            direction,
          })
        }
      }
    })
  })
}

function formatTime(isoString) {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '剛剛'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分鐘前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小時前`
  
  return date.toLocaleDateString('zh-TW', { 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

watch(() => props.rows, () => {
  if (alerts.value.length > 0) {
    checkAlerts()
  }
}, { deep: true })

watch(notifyEnabled, () => {
  saveNotifyPreference()
  if (notifyEnabled.value && Notification.permission !== 'granted') {
    requestNotificationPermission()
  }
})

onMounted(() => {
  loadAlerts()
  loadHistory()
  loadNotifyPreference()
  
  // Check alerts every 30 seconds
  checkInterval.value = setInterval(() => {
    if (alerts.value.length > 0) {
      checkAlerts()
    }
  }, 30000)
})

onBeforeUnmount(() => {
  if (checkInterval.value) {
    clearInterval(checkInterval.value)
  }
})
</script>

<template>
  <section class="alerts-section" id="alertsSection">
    <!-- Notification Settings Button -->
    <div class="notification-settings-banner">
      <div class="banner-content">
        <i class="fas fa-bell"></i>
        <div>
          <strong>通知設定</strong>
          <span>設定 Email 和 LINE 通知</span>
        </div>
      </div>
      <button class="btn-primary" @click="showNotificationSettings = !showNotificationSettings">
        <i class="fas" :class="showNotificationSettings ? 'fa-times' : 'fa-cog'"></i>
        {{ showNotificationSettings ? '關閉' : '設定' }}
      </button>
    </div>

    <!-- Notification Settings Panel -->
    <div v-if="showNotificationSettings" class="notification-settings-panel">
      <NotificationSettings />
    </div>

    <div class="alerts-grid">
      <div class="alerts-card">
        <h3><i class="fas fa-bell-plus"></i> 新增警示規則</h3>
        <div class="alerts-form">
          <div class="form-group">
            <label>股票代碼</label>
            <input 
              v-model="newAlert.symbol" 
              class="filter-input" 
              placeholder="例如: 2330 (留空=全部)" 
              @keyup.enter="createAlert"
            />
            <small class="form-hint">留空代表監控所有股票</small>
          </div>
          <div class="form-group">
            <label>警示類型</label>
            <select v-model="newAlert.type" class="filter-input">
              <option v-for="type in alertTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>觸發條件</label>
            <select v-model="newAlert.operator" class="filter-input">
              <option v-for="op in operators" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>閾值</label>
            <input 
              v-model.number="newAlert.threshold" 
              class="filter-input" 
              type="number" 
              step="0.01" 
              placeholder="輸入數值"
              @keyup.enter="createAlert"
            />
            <small class="form-hint">
              {{ alertTypes.find(t => t.value === newAlert.type)?.unit || '' }}
            </small>
          </div>
          <div class="form-group" style="grid-column: span 2;">
            <button class="btn-primary" @click="createAlert" style="width:100%; margin-top:1rem;">
              <i class="fas fa-plus"></i> 新增規則
            </button>
          </div>
        </div>
        <div class="form-group" style="margin-top: 1rem;">
          <label class="checkbox-label">
            <input type="checkbox" v-model="notifyEnabled" />
            <span>啟用瀏覽器推送通知</span>
            <i class="fas fa-bell" style="margin-left: auto; opacity: 0.5;"></i>
          </label>
          <small class="form-hint">需要授權瀏覽器通知權限</small>
        </div>
      </div>
      
      <div class="alerts-card">
        <h3>
          <i class="fas fa-list-check"></i> 警示規則
          <span class="badge">{{ alerts.length }}</span>
        </h3>
        <div class="alert-rules-list">
          <div v-if="!alerts.length" class="empty-state">
            <i class="fas fa-bell-slash"></i>
            <div>尚未設定任何規則</div>
            <small>請在左側新增警示規則</small>
          </div>
          <div 
            v-for="alert in alerts" 
            :key="alert.id" 
            class="alert-rule-item"
            :class="{ inactive: !alert.active }"
          >
            <div class="alert-rule-info">
              <div class="alert-rule-title">
                <i class="fas fa-bell" :class="alert.active ? 'text-success' : 'text-muted'"></i>
                {{ getAlertDescription(alert) }}
              </div>
              <div class="alert-rule-meta">
                <span class="badge-small">{{ alertTypes.find(t => t.value === alert.type)?.label }}</span>
                <span v-if="alert.triggeredCount > 0" class="badge-small badge-warning">
                  已觸發 {{ alert.triggeredCount }} 次
                </span>
              </div>
            </div>
            <div class="alert-rule-actions">
              <button 
                class="btn-icon" 
                @click="toggleAlert(alert.id)" 
                :title="alert.active ? '停用' : '啟用'"
              >
                <i class="fas" :class="alert.active ? 'fa-pause' : 'fa-play'"></i>
              </button>
              <button 
                class="btn-icon btn-danger" 
                @click="deleteAlert(alert.id)" 
                title="刪除"
              >
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="alerts-card">
        <h3>
          <i class="fas fa-inbox"></i> 警示收件匣
          <span class="badge">{{ alertHistory.length }}</span>
        </h3>
        <div class="alert-history-list">
          <div v-if="!alertHistory.length" class="empty-state">
            <i class="fas fa-inbox"></i>
            <div>收件匣為空</div>
            <small>觸發的警示將會顯示在此處</small>
          </div>
          <div 
            v-for="item in alertHistory" 
            :key="item.id" 
            class="alert-history-item"
          >
            <div class="alert-history-icon" :class="item.direction === '▲' ? 'positive' : 'negative'">
              {{ item.direction }}
            </div>
            <div class="alert-history-content">
              <div class="alert-history-title">
                <strong>{{ item.symbol }}</strong>
                <span v-if="item.name">{{ item.name }}</span>
              </div>
              <div class="alert-history-message">{{ item.message }}</div>
              <div class="alert-history-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>
        </div>
        <div class="alert-history-actions">
          <small class="muted">保留最近 100 筆記錄</small>
          <div>
            <button class="btn-icon" @click="exportHistory" title="匯出記錄">
              <i class="fas fa-download"></i>
            </button>
            <button class="btn-icon btn-danger" @click="clearHistory" title="清空記錄">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
