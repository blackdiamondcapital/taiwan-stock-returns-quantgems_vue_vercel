<script setup>
import { computed } from 'vue'
import { useAuth } from '../stores/auth'

const props = defineProps({
  date: { type: String, default: '' },
  asOf: { type: String, default: '' },
  apiState: { type: String, default: 'idle' }, // loading | connected | error
  apiText: { type: String, default: '等待載入' },
  currentView: { type: String, default: 'overview' },
})
const emit = defineEmits(['refresh', 'update:date', 'change-view', 'show-login', 'show-register', 'logout'])

const { isAuthenticated, user, logout } = useAuth()
const dotClass = computed(() => props.apiState === 'loading' ? 'loading' : props.apiState === 'connected' ? 'connected' : 'error')

function setView(v){ emit('change-view', v) }
function onDateInput(e){ emit('update:date', e.target.value) }

async function handleLogout() {
  await logout()
  if (props.currentView === 'profile') {
    emit('change-view', 'overview')
  }
}
</script>

<template>
  <div class="top-bar-shell">
    <header class="app-header">
      <div class="header-content">
        <div class="header-title">
          <i class="fas fa-chart-line"></i>
          <h1>QuantGem 報酬引擎</h1>
        </div>
        <div class="header-actions">
          <button class="btn-icon" id="refreshBtn" @click="emit('refresh')">
            <i class="fas fa-sync-alt"></i>
            重新整理
          </button>
          <div class="date-picker">
            <i class="far fa-calendar-alt"></i>
            <input type="date" id="datePicker" :value="date" @input="onDateInput" />
          </div>
          <span v-if="asOf" id="asOfBadge" class="asof-badge">資料日 {{ asOf }}</span>
          <div class="status-indicator" id="apiStatus">
            <span class="status-dot" :class="dotClass" id="apiStatusDot"></span>
            <span id="apiStatusText">{{ apiText }}</span>
          </div>
          
          <!-- 認證按鈕 -->
          <div class="auth-buttons">
            <template v-if="!isAuthenticated">
              <button class="btn-auth-header" @click="emit('show-login')">
                <i class="fas fa-sign-in-alt"></i>
                登入
              </button>
              <button class="btn-auth-header btn-primary" @click="emit('show-register')">
                <i class="fas fa-user-plus"></i>
                註冊
              </button>
            </template>
            <template v-else>
              <div class="user-menu">
                <button class="user-menu-trigger" @click="setView('profile')">
                  <div class="user-avatar">
                    <i class="fas fa-user"></i>
                  </div>
                  <span class="user-name">{{ user?.username || user?.email?.split('@')[0] }}</span>
                  <span v-if="user?.plan !== 'free'" class="user-plan-badge">
                    {{ user?.plan === 'enterprise' ? 'Enterprise' : 'Pro' }}
                  </span>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </header>

    <nav class="main-nav">
      <div class="nav-container">
        <button class="nav-item" :class="{active: currentView==='overview'}" data-view="overview" @click="setView('overview')">
          <i class="fas fa-tachometer-alt"></i>
          總覽
        </button>
        <button class="nav-item" :class="{active: currentView==='ranking'}" data-view="ranking" @click="setView('ranking')">
          <i class="fas fa-trophy"></i>
          排行榜
        </button>
        <button class="nav-item" :class="{active: currentView==='analysis'}" data-view="analysis" @click="setView('analysis')">
          <i class="fas fa-chart-bar"></i>
          深度分析
        </button>
        <button class="nav-item" :class="{active: currentView==='comparison'}" data-view="comparison" @click="setView('comparison')">
          <i class="fas fa-balance-scale"></i>
          比較工具
        </button>
        <button class="nav-item" :class="{active: currentView==='alerts'}" data-view="alerts" @click="setView('alerts')">
          <i class="fas fa-bell"></i>
          警示設定
        </button>
        <button class="nav-item" :class="{active: currentView==='pricing'}" data-view="pricing" @click="setView('pricing')">
          <i class="fas fa-tags"></i>
          訂閱方案
        </button>
        <button v-if="isAuthenticated" class="nav-item" :class="{active: currentView==='profile'}" data-view="profile" @click="setView('profile')">
          <i class="fas fa-user-circle"></i>
          個人資料
        </button>
        <button v-if="isAuthenticated" class="nav-item nav-item-logout" @click="handleLogout">
          <i class="fas fa-sign-out-alt"></i>
          登出
        </button>
      </div>
    </nav>
  </div>
</template>
