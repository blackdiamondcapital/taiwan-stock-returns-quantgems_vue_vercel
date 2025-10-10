<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import StockDrawer from './StockDrawer.vue'
import WatchlistPanel from './WatchlistPanel.vue'
import { addToWatchlist, removeFromWatchlist, fetchWatchlist } from '../services/api'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  sort: { type: Object, default: () => ({ column: 'return', direction: 'desc' }) },
  period: { type: String, default: 'daily' },
  filters: { type: Object, default: () => ({ market: 'all', industry: 'all', returnRange: 'all', volumeThreshold: 0 }) },
})
const emit = defineEmits(['change-sort', 'update:period', 'update:filters', 'stock-action'])

const activeMenu = ref(null)
const watchlist = ref(new Set())
const drawerVisible = ref(false)
const drawerMode = ref('detail')
const selectedStock = ref(null)
const watchlistPanelVisible = ref(false)

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

function handleClickOutside(event) {
  if (activeMenu.value && !event.target.closest('.card-actions')) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  loadWatchlist()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <section class="ranking-section">
    <div class="ranking-table-container">
      <div class="table-header">
        <div class="ranking-header-card">
          <div class="ranking-header-top">
            <div class="table-title"><i class="fas fa-list-ol"></i> 市場排行榜</div>
            <div class="header-actions">
              <button class="watchlist-btn" @click="openWatchlistPanel" title="我的自選股">
                <i class="fas fa-star"></i>
                <span>自選股</span>
                <span v-if="watchlist.size > 0" class="badge">{{ watchlist.size }}</span>
              </button>
            </div>
            <div class="ranking-period-control">
              <button
                v-for="item in periodOptions"
                :key="item.value"
                type="button"
                class="period-chip"
                :class="{ active: props.period === item.value }"
                @click="onSelectPeriod(item.value)"
              >{{ item.label }}</button>
            </div>
          </div>
          <div class="ranking-filter-bar">
            <label class="filter-label">市場別</label>
            <select class="filter-input" :value="props.filters.market" @change="onSelectMarket">
              <option value="all">全部市場</option>
              <option value="listed">上市</option>
              <option value="otc">上櫃</option>
            </select>
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

        <div class="ranking-list">
          <article
            v-for="item in rows"
            :key="item.symbol + '-' + item.rank"
            class="ranking-card"
            :class="[
              item.rank === 1 ? 'top-1' : '',
              item.rank === 2 ? 'top-2' : '',
              item.rank === 3 ? 'top-3' : ''
            ]"
          >
            <div class="card-rank">
              <span class="rank-badge" :class="{gold: item.rank===1, silver: item.rank===2, bronze: item.rank===3}">{{ item.rank }}</span>
              <div
                v-if="hasRankChange(item)"
                class="rank-change"
                :class="rankChangeClass(item)"
                :title="rankChangeLabel(item)"
              >
                <i class="fas" :class="rankChangeIcon(item)"></i>
                <span>{{ rankChangeText(item) }}</span>
              </div>
            </div>

            <div class="card-main">
              <div class="stock-info">
                <div class="stock-symbol">{{ item.symbol }}</div>
                <div class="stock-name">{{ item.short_name || item.name }}</div>
              </div>

              <dl class="stat-grid">
                <div class="stat-item">
                  <dt>報酬率</dt>
                  <dd :class="['stat-value', item.return>=0 ? 'positive' : 'negative']">
                    <i class="fas" :class="item.return>=0?'fa-arrow-up':'fa-arrow-down'"></i>
                    {{ Number(item.return).toFixed(2) }}%
                  </dd>
                </div>
                <div class="stat-item">
                  <dt>價格</dt>
                  <dd class="stat-value">{{ Number(item.price).toFixed(2) }}</dd>
                </div>
                <div class="stat-item">
                  <dt>漲跌</dt>
                  <dd :class="['stat-value', item.change>=0 ? 'positive' : 'negative']">
                    {{ (item.change>=0?'+':'') + Number(item.change).toFixed(2) }}
                  </dd>
                </div>
                <div class="stat-item">
                  <dt>成交量</dt>
                  <dd class="stat-value">{{ Number(item.volume||0).toLocaleString() }}</dd>
                </div>
              </dl>
            </div>

            <div class="card-actions">
              <button 
                type="button" 
                class="detail-button"
                :class="{ active: activeMenu === item.symbol }"
                @click="toggleMenu(item.symbol, $event)"
                title="快捷操作"
              >
                <i class="fas" :class="activeMenu === item.symbol ? 'fa-times' : 'fa-ellipsis-v'"></i>
              </button>
              
              <transition name="menu-fade">
                <div v-if="activeMenu === item.symbol" class="action-menu">
                  <button 
                    type="button"
                    class="menu-item"
                    @click="handleAction('detail', item, $event)"
                  >
                    <i class="fas fa-chart-line"></i>
                    <span>查看詳情</span>
                  </button>
                  
                  <button 
                    type="button"
                    class="menu-item"
                    :class="{ active: isInWatchlist(item.symbol) }"
                    @click="handleAction('watchlist', item, $event)"
                  >
                    <i class="fas" :class="isInWatchlist(item.symbol) ? 'fa-star' : 'fa-star-o'"></i>
                    <span>{{ isInWatchlist(item.symbol) ? '移除自選' : '加入自選' }}</span>
                  </button>
                  
                  <button 
                    type="button"
                    class="menu-item"
                    @click="handleAction('alert', item, $event)"
                  >
                    <i class="fas fa-bell"></i>
                    <span>價格提醒</span>
                  </button>

                  <button 
                    type="button"
                    class="menu-item"
                    @click="handleAction('analysis', item, $event)"
                  >
                    <i class="fas fa-wave-square"></i>
                    <span>技術分析</span>
                  </button>

                  <button 
                    type="button"
                    class="menu-item"
                    @click="handleAction('news', item, $event)"
                  >
                    <i class="fas fa-newspaper"></i>
                    <span>相關新聞</span>
                  </button>
                  
                </div>
              </transition>
            </div>
          </article>
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
  </section>
</template>
