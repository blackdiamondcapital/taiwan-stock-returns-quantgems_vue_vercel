<script setup>
import { onMounted, ref, reactive } from 'vue'
import { fetchRankings, fetchStatistics } from './services/api'
import { useAuth } from './stores/auth'
import HeaderNav from './components/HeaderNav.vue'
import StatsGrid from './components/StatsGrid.vue'
import Heatmap from './components/Heatmap.vue'
import RankingTable from './components/RankingTable.vue'
import Comparison from './components/Comparison.vue'
import Alerts from './components/Alerts.vue'
import Analysis from './components/Analysis.vue'
import LoginModal from './components/Auth/LoginModal.vue'
import RegisterModal from './components/Auth/RegisterModal.vue'
import UserProfile from './components/UserProfile.vue'
import Pricing from './components/Pricing.vue'

// Shared reactive state
const currentData = ref([])
const currentSort = ref({ column: 'return', direction: 'desc' })
const heatmapRows = ref([])
const tableRows = ref([])
const statsData = ref({})
let apiAsOfDate = null
const apiState = ref('idle')
const apiText = ref('等待載入')
const currentView = ref('overview')
const selectedDateRef = ref('')
const periodRef = ref('daily')
const filtersRef = reactive({ market: 'all', industry: 'all', returnRange: 'all', volumeThreshold: 0 })

// 認證狀態
const { token, isAuthenticated, user, fetchCurrentUser, setToken } = useAuth()
const showLoginModal = ref(false)
const showRegisterModal = ref(false)
let hasAttemptedAutoPeriodFallback = false
let allowDailyAutoFallback = false

onMounted(async () => {
  try {
    const params = new URLSearchParams(window.location.search)
    const oauthToken = params.get('token')
    const oauthError = params.get('error')

    if (oauthToken) {
      setToken(oauthToken)
      const result = await fetchCurrentUser()
      if (!result?.success) {
        console.error('OAuth fetchCurrentUser failed:', result?.error)
      } else {
        showLoginModal.value = false
      }

      params.delete('token')
      params.delete('provider')
      params.delete('error')
      const search = params.toString()
      const cleanUrl = `${window.location.origin}${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
      window.history.replaceState({}, document.title, cleanUrl)
    } else if (!oauthError && token.value && !user.value) {
      const result = await fetchCurrentUser()
      if (!result?.success) {
        console.error('Auto fetchCurrentUser failed:', result?.error)
      }
    }
  } catch (err) {
    console.error('OAuth callback handling error:', err)
  }
})

  const qs = (sel, root = document) => root.querySelector(sel)
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel))

  const setVisibility = (selector, display) => {
    // deprecated: now using v-show for view switches
  }

  function onChangeSort(newSort) {
    currentSort.value = newSort
    const rows = [...tableRows.value]
    sortData(rows)
    tableRows.value = rows
  }

  function setApiStatus(state, message) {
    const dot = qs('#apiStatusDot')
    const text = qs('#apiStatusText')
    if (!dot || !text) return
    dot.className = 'status-dot'
    dot.classList.add(state === 'loading' ? 'loading' : state === 'connected' ? 'connected' : 'error')
    text.textContent = message || (state === 'connected' ? '已連線' : state === 'loading' ? '載入中…' : '連線錯誤')
    apiState.value = state
    apiText.value = message || (state === 'connected' ? '已連線' : state === 'loading' ? '載入中…' : '連線失敗')
  }

  // updateAsOfBadge deprecated; HeaderNav shows asOf via props

  function getSelectedDate() {
    if (selectedDateRef.value) return selectedDateRef.value
    const el = qs('#datePicker')
    return el && el.value ? el.value : ''
  }
  function getSelectedPeriod() {
    return periodRef.value || 'daily'
  }
  function getMainFilters() {
    return { ...filtersRef, date: getSelectedDate() }
  }

  function sortData(data) {
    data.sort((a, b) => {
      const aVal = a[currentSort.value.column]
      const bVal = b[currentSort.value.column]
      if (typeof aVal === 'string') {
        return currentSort.value.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return currentSort.value.direction === 'asc' ? aVal - bVal : bVal - aVal
    })
    data.forEach((item, i) => (item.rank = i + 1))
  }

  function getReturnCategory(returnRate) {
    if (returnRate > 5) return 'positive-high'
    if (returnRate >= 1) return 'positive-mid'
    if (returnRate <= -5) return 'negative-high'
    if (returnRate <= -1) return 'negative-mid'
    return 'neutral'
  }

  // Heatmap is handled by Heatmap.vue component

  // Ranking table rendered by component via props

  async function loadAndRender() {
    const period = getSelectedPeriod()
    const filters = getMainFilters()
    setApiStatus('loading')
    const formatNumber = (value, digits = 0) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
      return Number(value).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    }
    const formatPercent = (value, digits = 1) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
      return `${Number(value).toFixed(digits)}%`
    }
    const formatRatio = (value, digits = 2, suffix = 'x') => {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--'
      return `${Number(value).toFixed(digits)}${suffix}`
    }

    const [list, statsResp] = await Promise.all([
      fetchRankings({ period, ...filters, limit: 200 }),
      fetchStatistics({ period, market: filters.market, date: filters.date })
    ])
    if (
      period === 'daily'
      && allowDailyAutoFallback
      && !hasAttemptedAutoPeriodFallback
      && list.length > 0
      && list.every((item) => Number(item.return_rate) === 0)
    ) {
      hasAttemptedAutoPeriodFallback = true
      periodRef.value = 'monthly'
      await loadAndRender()
      return
    }
    hasAttemptedAutoPeriodFallback = false
    // map to currentData shape
    currentData.value = list.map((item, idx) => ({
      rank: idx + 1,
      symbol: item.symbol,
      name: item.name || item.symbol,
      short_name: item.short_name || item.name || '',
      return: Number(item.return_rate) || 0,
      price: Number(item.current_price) || 0,
      priorClose: Number(item.prior_close) || 0,
      change: Number(item.price_change) || 0,
      volume: Number(item.volume) || 0,
      cumulative: Number(item.cumulative_return ?? item.return_rate) || 0,
      market: item.market || 'all',
      industry: item.industry || 'all',
      volatility: parseFloat(item.volatility) || 0.5,
    }))
    // update heatmap rows for component
    const rowsForHeatmap = currentData.value.map((r) => ({ symbol: r.symbol, name: r.name, return: r.return }))
    heatmapRows.value = rowsForHeatmap
    const sorted = [...currentData.value]
    sortData(sorted)
    tableRows.value = sorted

    // statistics
    if (statsResp && statsResp.data) {
      statsData.value = statsResp.data
      apiAsOfDate = statsResp.asOfDate || null
      setApiStatus('connected', '已連線')
    } else {
      setApiStatus('error', '連線失敗')
    }
  }

  // View switching
  function switchView(view) {
    currentView.value = view
    loadAndRender()
  }

  // Mount-time event wiring
  onMounted(() => {
    // 初始化日期（與原版一致：預設今天）
    if (!selectedDateRef.value) {
      const d = new Date()
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth()+1).padStart(2,'0')
      const dd = String(d.getDate()).padStart(2,'0')
      selectedDateRef.value = `${yyyy}-${mm}-${dd}`
    }
    // 初次載入
    loadAndRender()
  })

  // Header handlers
  function onHeaderRefresh(){ loadAndRender() }
  function onHeaderDateChange(v){ selectedDateRef.value = v; loadAndRender() }
  function onHeaderChangeView(v){ switchView(v) }

  // Filter handlers
function onUpdatePeriod(p){
  if (p === 'daily') {
    allowDailyAutoFallback = false
  } else {
    allowDailyAutoFallback = true
  }
  periodRef.value = p
  loadAndRender()
}
  function onUpdateFilters(f){ Object.assign(filtersRef, f); loadAndRender() }
</script>

<template>
  <div class="app-container">
    <HeaderNav
      :date="selectedDateRef"
      :asOf="apiAsOfDate"
      :apiState="apiState"
      :apiText="apiText"
      :currentView="currentView"
      @refresh="onHeaderRefresh"
      @update:date="onHeaderDateChange"
      @change-view="onHeaderChangeView"
      @show-login="showLoginModal = true"
      @show-register="showRegisterModal = true"
    />

    <!-- Main -->
    <main class="main-content">
    <div class="content-shell">
      <!-- Stats Cards -->
      <div v-show="currentView==='overview'">
        <StatsGrid
          :stats="statsData"
          :period="periodRef"
          :filters="filtersRef"
          @update:period="onUpdatePeriod"
          @update:filters="onUpdateFilters"
        />
      </div>

      <!-- Heatmap -->
      <div v-show="currentView==='overview'">
        <Heatmap :rows="heatmapRows" @refresh="loadAndRender" />
      </div>

      <!-- Ranking (hidden by default) -->
      <div v-show="currentView==='ranking'">
        <RankingTable
          :rows="tableRows"
          :sort="currentSort"
          :period="periodRef"
          :filters="filtersRef"
          @change-sort="onChangeSort"
          @update:period="onUpdatePeriod"
          @update:filters="onUpdateFilters"
        />
      </div>

      <!-- Analysis (hidden by default, controlled by view switch) -->
      <div v-show="currentView==='analysis'">
        <Analysis
          :rows="tableRows"
          :period="periodRef"
          :filters="filtersRef"
          :key="`analysis-${periodRef}-${filtersRef.market}`"
          @update:period="onUpdatePeriod"
          @update:filters="onUpdateFilters"
        />
      </div>

      <div v-show="currentView==='comparison'">
        <Comparison :rows="currentData" />
      </div>

      <div v-show="currentView==='alerts'">
        <Alerts :rows="currentData" />
      </div>

      <div v-show="currentView==='profile'">
        <UserProfile @change-view="onHeaderChangeView" />
      </div>

      <div v-show="currentView==='pricing'">
        <Pricing />
      </div>
    </div>
  </main>

  <!-- 認證模態框 -->
  <LoginModal
    v-if="showLoginModal"
    @close="showLoginModal = false"
    @switchToRegister="showLoginModal = false; showRegisterModal = true"
    @loginSuccess="fetchCurrentUser"
  />

  <RegisterModal
    v-if="showRegisterModal"
    @close="showRegisterModal = false"
    @switchToLogin="showRegisterModal = false; showLoginModal = true"
    @registerSuccess="fetchCurrentUser"
  />
  </div>
</template>

<style scoped>
/* 本檔案不再放置主要樣式，樣式集中在 src/legacy.css */
</style>
