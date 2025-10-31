<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import StockDrawer from './StockDrawer.vue'
import WatchlistPanel from './WatchlistPanel.vue'
import { addToWatchlist, removeFromWatchlist, fetchWatchlist } from '../services/api'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  sort: { type: Object, default: () => ({ column: 'return', direction: 'desc' }) },
  period: { type: String, default: 'daily' },
  filters: { type: Object, default: () => ({ market: 'all', industry: 'all', returnRange: 'all', volumeThreshold: 0 }) },
})
const emit = defineEmits(['change-sort', 'update:period', 'update:filters', 'update:rankingType', 'stock-action'])

const activeMenu = ref(null)
const watchlist = ref(new Set())
const drawerVisible = ref(false)
const drawerMode = ref('detail')
const selectedStock = ref(null)
const watchlistPanelVisible = ref(false)

// 滾動相關
const showScrollTop = ref(false)
const showQuickNav = ref(false)
const quickNavExpanded = ref(true) // 快速跳轉展開狀態
const rankingContainer = ref(null)

// 視圖模式
const viewMode = ref('table') // 固定為表格模式
const viewModeOptions = [
  { value: 'list', label: '列表', icon: 'fa-list' },
  { value: 'table', label: '表格', icon: 'fa-table' },
  { value: 'waterfall', label: '瀑布流', icon: 'fa-grip' },
]

// 方案五：分組篩選
const selectedGroup = ref('all')
const rankingType = ref('gainers') // 'gainers' 或 'losers'

// 動態分組選項：根據排行類型顯示不同的分組
const groupOptions = computed(() => {
  if (rankingType.value === 'losers') {
    // 跌幅排行：顯示負值分組
    return [
      { value: 'all', label: '全部', color: '#64c8ff' },
      { value: 'hot', label: '重挫股 ≤-10%', color: '#22c55e', max: -10, inclusive: true },
      { value: 'rising', label: '大跌 -10% ~ -5%', color: '#4ade80', min: -10, max: -5 },
      { value: 'stable', label: '小跌 -5% ~ 0%', color: '#86efac', min: -5, max: 0 },
    ]
  } else {
    // 漲幅排行：顯示正值分組
    return [
      { value: 'all', label: '全部', color: '#64c8ff' },
      { value: 'hot', label: '強勢股 ≥10%', color: '#ef4444', min: 10, inclusive: true },
      { value: 'rising', label: '上漲 5-10%', color: '#f87171', min: 5, max: 10 },
      { value: 'stable', label: '平穩 0-5%', color: '#f59e0b', min: 0, max: 5 },
    ]
  }
})

const rankingTypeOptions = [
  { value: 'gainers', label: '漲幅排行', icon: 'fa-arrow-trend-up', color: '#ef4444' },
  { value: 'losers', label: '跌幅排行', icon: 'fa-arrow-trend-down', color: '#22c55e' },
]

const periodOptions = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '週' },
  { value: 'monthly', label: '月' },
  { value: 'quarterly', label: '季' },
  { value: 'yearly', label: '年' },
]

const sortColumns = [
  { key: 'rank', label: '名次' },
  { key: 'symbol', label: '股票' },
  { key: 'return', label: '報酬率' },
  { key: 'price', label: '價格' },
  { key: 'change', label: '漲跌' },
  { key: 'volume', label: '成交量' },
]

function onHeaderClick(col){
  const dir = (props.sort.column === col) ? (props.sort.direction === 'asc' ? 'desc' : 'asc') : 'desc'
  emit('change-sort', { column: col, direction: dir })
}

function onSelectMarket(event){
  const next = { ...props.filters, market: event.target.value }
  emit('update:filters', next)
}

function onSelectPeriod(p){
  if (p === props.period) return
  emit('update:period', p)
}

function getSortIcon(key) {
  if (props.sort.column !== key) return 'fa-sort'
  return props.sort.direction === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'
}

function getSortClass(key) {
  return props.sort.column === key ? `active ${props.sort.direction}` : ''
}

function resolveRankChange(item) {
  const candidates = [
    item.rankChange,
    item.rank_change,
    item.rankDelta,
    item.rank_delta,
    item.rank_diff,
    item.rankDifference,
  ]
  const delta = candidates.find(value => value !== undefined && value !== null)
  const numeric = Number(delta)
  return Number.isFinite(numeric) ? numeric : 0
}

function rankChangeClass(item) {
  const delta = resolveRankChange(item)
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'steady'
}

function hasRankChange(item) {
  const delta = resolveRankChange(item)
  return !!delta
}

function rankChangeIcon(item) {
  const delta = resolveRankChange(item)
  if (delta > 0) return 'fa-arrow-up'
  if (delta < 0) return 'fa-arrow-down'
  return null
}

function rankChangeText(item) {
  const delta = resolveRankChange(item)
  if (!delta) return null
  return delta > 0 ? `+${delta}` : `${delta}`
}

function rankChangeLabel(item) {
  const delta = resolveRankChange(item)
  if (delta > 0) return `上升 ${Math.abs(delta)}`
  if (delta < 0) return `下跌 ${Math.abs(delta)}`
  return '持平'
}

function toggleMenu(symbol, event) {
  event?.stopPropagation()
  activeMenu.value = activeMenu.value === symbol ? null : symbol
}

function closeMenu() {
  activeMenu.value = null
}

function handleAction(action, item, event) {
  event?.stopPropagation()
  
  switch(action) {
    case 'detail':
      openDrawer(item, 'detail')
      emit('stock-action', { action: 'detail', symbol: item.symbol, data: item })
      break
    case 'watchlist':
      toggleWatchlist(item.symbol)
      break
    case 'alert':
      emit('stock-action', { action: 'alert', symbol: item.symbol, data: item })
      console.log('设置价格提醒:', item.symbol)
      break
    case 'analysis':
      openDrawer(item, 'analysis')
      emit('stock-action', { action: 'analysis', symbol: item.symbol, data: item })
      break
    case 'news':
      openDrawer(item, 'news')
      emit('stock-action', { action: 'news', symbol: item.symbol, data: item })
      break
  }
  
  closeMenu()
}

function openDrawer(stock, mode) {
  selectedStock.value = stock
  drawerMode.value = mode
  drawerVisible.value = true
}

function closeDrawer() {
  drawerVisible.value = false
}

async function toggleWatchlist(symbol) {
  if (watchlist.value.has(symbol)) {
    await removeFromWatchlist(symbol)
    watchlist.value.delete(symbol)
    console.log('移除自選股:', symbol)
  } else {
    await addToWatchlist(symbol)
    watchlist.value.add(symbol)
    console.log('加入自選股:', symbol)
  }
  watchlist.value = new Set(watchlist.value)
  emit('stock-action', { action: 'watchlist', symbol, inWatchlist: watchlist.value.has(symbol) })
}

async function loadWatchlist() {
  const symbols = await fetchWatchlist()
  watchlist.value = new Set(symbols)
}

function openWatchlistPanel() {
  watchlistPanelVisible.value = true
}

function handleWatchlistSelect(stock) {
  openDrawer(stock, 'detail')
}

function isInWatchlist(symbol) {
  return watchlist.value.has(symbol)
}

async function copySymbol(symbol) {
  try {
    await navigator.clipboard.writeText(symbol)
    console.log('已复制股票代码:', symbol)
    // 可以添加 toast 提示
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// 生成迷你趨勢圖的點
function generateTrendPoints(item) {
  // 生成簡單的趨勢線（模擬數據）
  const points = []
  const segments = 10
  const baseValue = 15
  const trend = item.return || 0
  
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * 100
    const randomVariation = (Math.random() - 0.5) * 5
    const trendValue = (trend / 10) * i
    const y = baseValue - trendValue + randomVariation
    points.push(`${x},${Math.max(0, Math.min(30, y))}`)
  }
  
  return points.join(' ')
}

// 方案五：分組邏輯（根據漲跌幅類型過濾）
const groupedRows = computed(() => {
  // 調試信息
  console.log('=== RankingTable Debug ===')
  console.log('Total rows:', props.rows.length)
  console.log('Ranking type:', rankingType.value)
  console.log('Selected group:', selectedGroup.value)
  console.log('Sort:', props.sort)
  
  if (props.rows.length > 0) {
    console.log('Sample data:', props.rows.slice(0, 3).map(r => ({
      symbol: r.symbol,
      return: r.return,
      rank: r.rank
    })))
  }
  
  // 先根據漲跌幅類型過濾
  let filteredRows = props.rows
  if (rankingType.value === 'gainers') {
    filteredRows = props.rows.filter(item => Number(item.return || 0) >= 0)
  } else if (rankingType.value === 'losers') {
    filteredRows = props.rows.filter(item => Number(item.return || 0) < 0)
  }
  
  console.log('Filtered rows:', filteredRows.length)
  if (filteredRows.length > 0) {
    console.log('Filtered sample:', filteredRows.slice(0, 3).map(r => ({
      symbol: r.symbol,
      return: r.return
    })))
  }
  
  // 計算所有分組（無論當前選擇哪個分組，都要計算所有分組的數量）
  const groups = {
    all: { 
      items: filteredRows, 
      label: rankingType.value === 'gainers' ? '全部上漲股票' : '全部下跌股票', 
      color: rankingType.value === 'gainers' ? '#ef4444' : '#22c55e'
    }
  }
  
  groupOptions.value.forEach(option => {
    if (option.value === 'all') return
    
    const filtered = filteredRows.filter(item => {
      const returnValue = Number(item.return || 0)
      if (option.min !== undefined && option.max !== undefined) {
        // 有上下限
        return returnValue >= option.min && returnValue < option.max
      } else if (option.min !== undefined) {
        // 只有下限（如：≥10%）
        if (option.inclusive) {
          return returnValue >= option.min  // 包含等於
        } else {
          return returnValue > option.min   // 不包含等於
        }
      } else if (option.max !== undefined) {
        // 只有上限（如：≤-10%）
        if (option.inclusive) {
          return returnValue <= option.max  // 包含等於
        } else {
          return returnValue < option.max   // 不包含等於
        }
      }
      return false
    })
    
    // 即使數量為 0 也要加入，這樣按鈕才能顯示 0
    groups[option.value] = {
      items: filtered,
      label: option.label,
      color: option.color
    }
  })
  
  return groups
})

// 根據選中的分組過濾顯示的數據
const displayedGroups = computed(() => {
  if (selectedGroup.value === 'all') {
    // 顯示所有分組
    return groupedRows.value
  } else {
    // 只顯示選中的分組
    const selectedGroupData = groupedRows.value[selectedGroup.value]
    if (selectedGroupData) {
      return {
        [selectedGroup.value]: selectedGroupData
      }
    }
    return {}
  }
})

function selectGroup(value) {
  selectedGroup.value = value
}

function selectRankingType(value) {
  rankingType.value = value
  
  // 切換類型時重置分組選擇為「全部」
  // 特別是從跌幅切換到漲幅時，如果當前選擇的是「下跌」分組，必須重置
  selectedGroup.value = 'all'
  
  // 通知父組件重新載入數據（帶上 rankingType 參數）
  emit('update:rankingType', value)
  
  // 切換排序方向：漲幅排行用降序（從大到小），跌幅排行用升序（從小到大，即最跌的在前）
  if (value === 'losers') {
    // 跌幅排行：按報酬率升序排列（負數越小越前面）
    emit('change-sort', { column: 'return', direction: 'asc' })
  } else if (value === 'gainers') {
    // 漲幅排行：按報酬率降序排列（正數越大越前面）
    emit('change-sort', { column: 'return', direction: 'desc' })
  }
}

function getGroupClass(returnValue) {
  if (returnValue >= 10) return 'group-hot'
  if (returnValue >= 5) return 'group-rising'
  if (returnValue >= 0) return 'group-stable'
  return 'group-falling'
}

function handleClickOutside(event) {
  if (activeMenu.value && !event.target.closest('.card-actions')) {
    closeMenu()
  }
}

// 滾動處理
function handleScroll() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  showScrollTop.value = scrollTop > 300
  showQuickNav.value = scrollTop > 200
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToRank(rank) {
  // 根據當前視圖模式選擇不同的選擇器
  let selector = ''
  if (viewMode.value === 'waterfall') {
    selector = '.ranking-card'
  } else if (viewMode.value === 'list') {
    selector = '.list-item'
  } else if (viewMode.value === 'table') {
    selector = '.table-row'
  }
  
  const items = document.querySelectorAll(selector)
  if (items[rank - 1]) {
    items[rank - 1].scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// 快速跳轉選項
const quickNavOptions = computed(() => {
  const total = props.rows.length
  const options = [
    { label: 'Top 10', rank: 1, show: total >= 10 },
    { label: '11-30', rank: 11, show: total >= 11 },
    { label: '31-50', rank: 31, show: total >= 31 },
    { label: '51-100', rank: 51, show: total >= 51 },
    { label: '100+', rank: 101, show: total >= 101 },
  ]
  return options.filter(opt => opt.show)
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', handleScroll)
  loadWatchlist()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <section class="ranking-section waterfall-style">
    <div class="ranking-table-container">
      <div class="table-header">
        <div class="ranking-header-card waterfall-header">
          <div class="ranking-header-top">
            <div class="table-title waterfall-title">
              <i class="fas fa-layer-group"></i>
              <span class="title-text">市場排行榜</span>
              <span class="title-subtitle">智能分組顯示</span>
            </div>
            
            <!-- 漲跌幅切換按鈕 -->
            <div class="ranking-type-switch">
              <button
                v-for="option in rankingTypeOptions"
                :key="option.value"
                class="type-switch-btn"
                :class="{ active: rankingType === option.value }"
                :style="{ '--type-color': option.color }"
                @click="selectRankingType(option.value)"
              >
                <i class="fas" :class="option.icon"></i>
                <span>{{ option.label }}</span>
              </button>
            </div>

            <div class="header-actions">
              <button class="watchlist-btn waterfall-btn" @click="openWatchlistPanel" title="我的自選股">
                <i class="fas fa-star"></i>
                <span>自選股</span>
                <span v-if="watchlist.size > 0" class="badge">{{ watchlist.size }}</span>
              </button>
            </div>
            <div class="ranking-period-control waterfall-tabs">
              <button
                v-for="item in periodOptions"
                :key="item.value"
                type="button"
                class="period-chip waterfall-tab"
                :class="{ active: props.period === item.value }"
                @click="onSelectPeriod(item.value)"
              >
                <span class="tab-label">{{ item.label }}</span>
                <span class="tab-indicator"></span>
              </button>
            </div>
          </div>
          <!-- 分組篩選標籤雲 -->
          <div class="group-filter-bar">
            <div class="filter-tags">
              <button
                v-for="option in groupOptions"
                :key="option.value"
                class="filter-tag"
                :class="{ active: selectedGroup === option.value }"
                :style="{ '--tag-color': option.color }"
                @click="selectGroup(option.value)"
              >
                <span class="tag-label">{{ option.label }}</span>
                <span class="tag-count" v-if="option.value !== 'all'">
                  {{ groupedRows[option.value]?.items.length || 0 }}
                </span>
              </button>
            </div>
            <div class="market-filter">
              <label class="filter-label">市場</label>
              <select class="filter-input waterfall-select" :value="props.filters.market" @change="onSelectMarket">
                <option value="all">全部</option>
                <option value="listed">上市</option>
                <option value="otc">上櫃</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="ranking-content">
        <div class="ranking-sort-bar">
          <div
            v-for="col in sortColumns"
            :key="col.key"
            class="sort-chip"
            :class="getSortClass(col.key)"
            role="button"
            tabindex="0"
            @click="onHeaderClick(col.key)"
            @keydown.enter.prevent="onHeaderClick(col.key)"
            @keydown.space.prevent="onHeaderClick(col.key)"
          >
            <span>{{ col.label }}</span>
            <i class="fas" :class="getSortIcon(col.key)"></i>
          </div>
        </div>

        <!-- 瀑布流分組容器 -->
        <div class="waterfall-container">
          <!-- 空狀態提示 -->
          <div v-if="Object.keys(displayedGroups).length === 0 || (displayedGroups.all && displayedGroups.all.items.length === 0)" class="empty-state">
            <i class="fas fa-inbox"></i>
            <h3>暫無數據</h3>
            <p v-if="rankingType === 'losers'">
              當前沒有符合條件的下跌股票<br>
              市場可能處於上漲趨勢 📈
            </p>
            <p v-else>
              當前沒有符合條件的上漲股票<br>
              市場可能處於下跌趨勢 📉
            </p>
            <button class="switch-type-btn" @click="selectRankingType(rankingType === 'gainers' ? 'losers' : 'gainers')">
              切換到{{ rankingType === 'gainers' ? '跌幅' : '漲幅' }}排行
            </button>
          </div>

          <div
            v-for="(group, groupKey) in displayedGroups"
            :key="groupKey"
            class="group-section"
            :class="'group-' + groupKey"
          >
            <!-- 分組標題 -->
            <div class="group-header" :style="{ '--group-color': group.color }">
              <div class="group-title">
                <i class="fas fa-folder-open"></i>
                <span>{{ group.label }}</span>
              </div>
              <div class="group-count">{{ group.items.length }} 檔</div>
            </div>

            <!-- 瀑布流卡片 -->
            <div v-if="viewMode === 'waterfall'" class="waterfall-grid">
              <article
                v-for="(item, index) in group.items"
                :key="item.symbol + '-' + item.rank"
                class="ranking-card waterfall-card"
                :class="[
                  getGroupClass(item.return),
                  item.rank <= 3 ? 'top-rank' : ''
                ]"
                :style="{ '--card-index': index }"
              >
                <!-- 卡片頭部 -->
                <div class="card-header">
                  <div class="rank-badge">
                    <span class="rank-number">#{{ item.rank }}</span>
                    <div
                      v-if="hasRankChange(item)"
                      class="rank-change-mini"
                      :class="rankChangeClass(item)"
                    >
                      <i class="fas" :class="rankChangeIcon(item)"></i>
                    </div>
                  </div>
                  <button
                    class="watchlist-icon"
                    :class="{ active: isInWatchlist(item.symbol) }"
                    @click.stop="toggleWatchlist(item.symbol)"
                  >
                    <i class="fas" :class="isInWatchlist(item.symbol) ? 'fa-star' : 'fa-star-o'"></i>
                  </button>
                </div>

                <!-- 卡片主體 -->
                <div class="card-body">
                  <div class="stock-info">
                    <div class="stock-symbol">{{ item.symbol }}</div>
                    <div class="stock-name">{{ item.short_name || item.name }}</div>
                  </div>

                  <!-- 主要數據 -->
                  <div class="main-stat">
                    <div class="stat-label">報酬率</div>
                    <div :class="['stat-value', item.return>=0 ? 'positive' : 'negative']">
                      <i class="fas" :class="item.return>=0?'fa-arrow-up':'fa-arrow-down'"></i>
                      {{ Number(item.return).toFixed(2) }}%
                    </div>
                  </div>

                  <!-- 次要數據 -->
                  <div class="secondary-stats">
                    <div class="stat-row">
                      <span class="label">價格</span>
                      <span class="value">{{ Number(item.price).toFixed(2) }}</span>
                    </div>
                    <div class="stat-row">
                      <span class="label">漲跌</span>
                      <span :class="['value', item.change>=0 ? 'positive' : 'negative']">
                        {{ (item.change>=0?'+':'') + Number(item.change).toFixed(2) }}
                      </span>
                    </div>
                    <div class="stat-row">
                      <span class="label">成交量</span>
                      <span class="value">{{ (Number(item.volume||0)/1000).toFixed(0) }}K</span>
                    </div>
                  </div>
                </div>

                <!-- 卡片底部操作 -->
                <div class="card-footer">
                  <button 
                    class="action-btn"
                    @click="handleAction('detail', item, $event)"
                  >
                    <i class="fas fa-chart-line"></i>
                    詳情
                  </button>
                  <button 
                    class="action-btn"
                    @click="handleAction('analysis', item, $event)"
                  >
                    <i class="fas fa-wave-square"></i>
                    分析
                  </button>
                </div>
              </article>
            </div>

            <!-- 列表視圖 -->
            <div v-if="viewMode === 'list'" class="list-view">
              <div
                v-for="item in group.items"
                :key="item.symbol + '-list'"
                class="list-item"
                :class="[getGroupClass(item.return), item.rank <= 3 ? 'top-rank' : '']"
              >
                <div class="list-rank">#{{ item.rank }}</div>
                <div class="list-content">
                  <div class="list-main">
                    <div class="list-stock">
                      <span class="list-symbol">{{ item.symbol }}</span>
                      <span class="list-name">{{ item.short_name || item.name }}</span>
                    </div>
                    <div class="list-return" :class="item.return >= 0 ? 'positive' : 'negative'">
                      <i class="fas" :class="item.return >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                      {{ Math.abs(item.return).toFixed(2) }}%
                    </div>
                  </div>
                  <div class="list-stats">
                    <span class="list-stat">
                      <i class="fas fa-dollar-sign"></i>
                      {{ item.price.toFixed(2) }}
                    </span>
                    <span class="list-stat">
                      <i class="fas fa-chart-line"></i>
                      {{ item.change >= 0 ? '+' : '' }}{{ item.change.toFixed(2) }}
                    </span>
                    <span class="list-stat">
                      <i class="fas fa-chart-bar"></i>
                      {{ (Number(item.volume||0)/1000).toFixed(0) }}K
                    </span>
                  </div>
                </div>
                <div class="list-actions">
                  <button class="list-action-btn" @click="handleAction('detail', item, $event)" title="詳情">
                    <i class="fas fa-info-circle"></i>
                  </button>
                  <button 
                    class="list-action-btn"
                    :class="{ active: isInWatchlist(item.symbol) }"
                    @click="toggleWatchlist(item.symbol)"
                    title="加入自選"
                  >
                    <i class="fas fa-star"></i>
                  </button>
                </div>
              </div>
            </div>

            <!-- 表格視圖 -->
            <div v-if="viewMode === 'table'" class="table-view">
              <table class="ranking-table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>股票代號</th>
                    <th>股票名稱</th>
                    <th>報酬率</th>
                    <th>價格</th>
                    <th>漲跌</th>
                    <th>成交量</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in group.items"
                    :key="item.symbol + '-table'"
                    class="table-row"
                    :class="[getGroupClass(item.return), item.rank <= 3 ? 'top-rank' : '']"
                  >
                    <td class="table-rank">#{{ item.rank }}</td>
                    <td class="table-symbol">{{ item.symbol }}</td>
                    <td class="table-name">{{ item.short_name || item.name }}</td>
                    <td class="table-return" :class="item.return >= 0 ? 'positive' : 'negative'">
                      <i class="fas" :class="item.return >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                      {{ Math.abs(item.return).toFixed(2) }}%
                    </td>
                    <td class="table-price">{{ item.price.toFixed(2) }}</td>
                    <td class="table-change" :class="item.change >= 0 ? 'positive' : 'negative'">
                      {{ item.change >= 0 ? '+' : '' }}{{ item.change.toFixed(2) }}
                    </td>
                    <td class="table-volume">{{ (Number(item.volume||0)/1000).toFixed(0) }}K</td>
                    <td class="table-actions">
                      <button class="table-action-btn" @click="handleAction('detail', item, $event)" title="詳情">
                        <i class="fas fa-info-circle"></i>
                      </button>
                      <button class="table-action-btn" @click="handleAction('analysis', item, $event)" title="技術線圖">
                        <i class="fas fa-chart-line"></i>
                      </button>
                      <button 
                        class="table-action-btn"
                        :class="{ active: isInWatchlist(item.symbol) }"
                        @click="toggleWatchlist(item.symbol)"
                        title="自選"
                      >
                        <i class="fas fa-star"></i>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <StockDrawer
      v-model:visible="drawerVisible"
      v-model:mode="drawerMode"
      :stock-data="selectedStock || {}"
      @close="closeDrawer"
    />
    
    <WatchlistPanel
      v-model:visible="watchlistPanelVisible"
      @select-stock="handleWatchlistSelect"
    />

    <!-- 回到頂部按鈕 -->
    <transition name="fade-slide">
      <button
        v-if="showScrollTop"
        class="scroll-to-top"
        @click="scrollToTop"
        title="回到頂部"
      >
        <i class="fas fa-arrow-up"></i>
      </button>
    </transition>

    <!-- 快速跳轉導航 -->
    <transition name="slide-right">
      <div v-if="showQuickNav && quickNavOptions.length > 0" class="quick-nav" :class="{ collapsed: !quickNavExpanded }">
        <div class="quick-nav-header">
          <div class="quick-nav-title">
            <i class="fas fa-bolt"></i>
            <span v-if="quickNavExpanded">快速跳轉</span>
          </div>
          <button class="quick-nav-toggle" @click="quickNavExpanded = !quickNavExpanded" :title="quickNavExpanded ? '收合' : '展開'">
            <i class="fas" :class="quickNavExpanded ? 'fa-chevron-right' : 'fa-chevron-left'"></i>
          </button>
        </div>
        <div v-if="quickNavExpanded" class="quick-nav-content">
          <button
            v-for="option in quickNavOptions"
            :key="option.rank"
            class="quick-nav-btn"
            @click="scrollToRank(option.rank)"
            :title="`跳轉到第 ${option.rank} 名`"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </transition>
  </section>
</template>
