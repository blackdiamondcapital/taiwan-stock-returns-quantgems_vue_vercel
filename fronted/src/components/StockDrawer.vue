<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { fetchStockNews, fetchStockFinancials, fetchStockPerformance } from '../services/api'
import StockChartECharts from './StockChartECharts.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'detail' }, // detail, news, analysis
  stockData: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'update:visible', 'update:mode'])

const localVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

function close() {
  localVisible.value = false
  emit('close')
}

// Data states
const newsData = ref([])
const financialData = ref(null)
const performanceData = ref(null)
const loading = ref({
  news: false,
  financial: false,
  performance: false
})

const expandedNews = ref(new Set())

function toggleNews(id) {
  if (expandedNews.value.has(id)) {
    expandedNews.value.delete(id)
  } else {
    expandedNews.value.add(id)
  }
  expandedNews.value = new Set(expandedNews.value)
}

// Load data functions
async function loadNewsData() {
  if (!props.stockData.symbol) return
  loading.value.news = true
  try {
    newsData.value = await fetchStockNews(props.stockData.symbol)
  } finally {
    loading.value.news = false
  }
}

async function loadFinancialData() {
  if (!props.stockData.symbol) return
  loading.value.financial = true
  try {
    financialData.value = await fetchStockFinancials(props.stockData.symbol)
  } finally {
    loading.value.financial = false
  }
}

async function loadPerformanceData() {
  if (!props.stockData.symbol) return
  loading.value.performance = true
  try {
    const perf = await fetchStockPerformance(props.stockData.symbol)
    performanceData.value = {
      daily: perf?.daily ?? props.stockData.return ?? 0,
      weekly: perf?.weekly ?? 0,
      monthly: perf?.monthly ?? 0,
      quarterly: perf?.quarterly ?? 0,
      yearly: perf?.yearly ?? 0
    }
  } finally {
    loading.value.performance = false
  }
}

// Computed properties
const financialMetrics = computed(() => {
  return financialData.value || {
    pe: '-',
    pb: '-',
    roe: '-',
    dividend: '-',
    marketCap: '-',
    eps: '-'
  }
})

// Watch for data changes
watch(() => props.visible, (newVal) => {
  if (newVal && props.stockData.symbol) {
    loadFinancialData()
    loadPerformanceData()
    if (props.mode === 'news') {
      loadNewsData()
    }
  }
})

watch(() => props.mode, (newMode) => {
  if (newMode === 'news' && props.visible && newsData.value.length === 0) {
    loadNewsData()
  }
})

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}
</script>

<template>
  <teleport to="body">
    <transition name="drawer-fade">
      <div v-if="localVisible" class="drawer-overlay" @click="close">
        <transition name="drawer-slide">
          <div v-if="localVisible" class="drawer-panel" @click.stop>
            <div class="drawer-header">
              <div class="drawer-title-group">
                <div class="stock-title">
                  <span class="symbol">{{ stockData.symbol }}</span>
                  <span class="name">{{ stockData.name || stockData.short_name }}</span>
                </div>
                <div class="stock-price-info">
                  <span class="price">{{ Number(stockData.price || 0).toFixed(2) }}</span>
                  <span class="change" :class="stockData.change >= 0 ? 'positive' : 'negative'">
                    {{ (stockData.change >= 0 ? '+' : '') + Number(stockData.change || 0).toFixed(2) }}
                    ({{ (stockData.return || 0).toFixed(2) }}%)
                  </span>
                </div>
              </div>
              <button class="close-btn" @click="close" title="关闭">
                <i class="fas fa-times"></i>
              </button>
            </div>

            <div class="drawer-tabs">
              <button 
                class="tab-btn" 
                :class="{ active: mode === 'detail' }"
                @click="$emit('update:mode', 'detail')"
              >
                <i class="fas fa-chart-line"></i>
                <span>詳細資訊</span>
              </button>
              <button 
                class="tab-btn" 
                :class="{ active: mode === 'news' }"
                @click="$emit('update:mode', 'news')"
              >
                <i class="fas fa-newspaper"></i>
                <span>相關新聞</span>
              </button>
              <button 
                class="tab-btn" 
                :class="{ active: mode === 'analysis' }"
                @click="$emit('update:mode', 'analysis')"
              >
                <i class="fas fa-wave-square"></i>
                <span>技術分析</span>
              </button>
            </div>

            <div class="drawer-content">
              <!-- 詳細資訊 -->
              <div v-if="mode === 'detail'" class="content-section">
                <div class="section-title">
                  <i class="fas fa-info-circle"></i>
                  <span>基本資訊</span>
                </div>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="label">股票代碼</span>
                    <span class="value">{{ stockData.symbol }}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">股票名稱</span>
                    <span class="value">{{ stockData.name || stockData.short_name }}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">當前價格</span>
                    <span class="value">{{ Number(stockData.price || 0).toFixed(2) }}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">成交量</span>
                    <span class="value">{{ Number(stockData.volume || 0).toLocaleString() }}</span>
                  </div>
                </div>

                <div class="section-title">
                  <i class="fas fa-calculator"></i>
                  <span>財務指標</span>
                </div>
                <div class="metrics-grid">
                  <div class="metric-card">
                    <div class="metric-label">本益比 (P/E)</div>
                    <div class="metric-value">{{ financialMetrics.pe }}</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">股價淨值比 (P/B)</div>
                    <div class="metric-value">{{ financialMetrics.pb }}</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">股東權益報酬率</div>
                    <div class="metric-value">{{ financialMetrics.roe }}</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">股息殖利率</div>
                    <div class="metric-value">{{ financialMetrics.dividend }}</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">市值</div>
                    <div class="metric-value">{{ financialMetrics.marketCap }}</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">每股盈餘 (EPS)</div>
                    <div class="metric-value">{{ financialMetrics.eps }}</div>
                  </div>
                </div>

                <div class="section-title">
                  <i class="fas fa-chart-bar"></i>
                  <span>近期表現</span>
                </div>
                <div v-if="loading.performance" class="loading-state">
                  <i class="fas fa-spinner fa-spin"></i>
                  <span>載入中...</span>
                </div>
                <div v-else-if="!performanceData" class="empty-state">
                  <i class="fas fa-inbox"></i>
                  <p>暫無資料</p>
                </div>
                <div v-else class="performance-list">
                  <div class="performance-item">
                    <span class="period">日報酬率</span>
                    <span class="perf-value" :class="performanceData.daily >= 0 ? 'positive' : 'negative'">
                      {{ performanceData.daily.toFixed(2) }}%
                    </span>
                  </div>
                  <div class="performance-item">
                    <span class="period">週報酬率</span>
                    <span class="perf-value" :class="performanceData.weekly >= 0 ? 'positive' : 'negative'">
                      {{ performanceData.weekly.toFixed(2) }}%
                    </span>
                  </div>
                  <div class="performance-item">
                    <span class="period">月報酬率</span>
                    <span class="perf-value" :class="performanceData.monthly >= 0 ? 'positive' : 'negative'">
                      {{ performanceData.monthly.toFixed(2) }}%
                    </span>
                  </div>
                  <div class="performance-item">
                    <span class="period">季報酬率</span>
                    <span class="perf-value" :class="performanceData.quarterly >= 0 ? 'positive' : 'negative'">
                      {{ performanceData.quarterly.toFixed(2) }}%
                    </span>
                  </div>
                  <div class="performance-item">
                    <span class="period">年報酬率</span>
                    <span class="perf-value" :class="performanceData.yearly >= 0 ? 'positive' : 'negative'">
                      {{ performanceData.yearly.toFixed(2) }}%
                    </span>
                  </div>
                </div>
              </div>

              <!-- 相關新聞 -->
              <div v-if="mode === 'news'" class="content-section">
                <div class="section-title">
                  <i class="fas fa-newspaper"></i>
                  <span>最新消息</span>
                </div>
                <div v-if="loading.news" class="loading-state">
                  <i class="fas fa-spinner fa-spin"></i>
                  <span>載入中...</span>
                </div>
                <div v-else-if="newsData.length === 0" class="empty-state">
                  <i class="fas fa-inbox"></i>
                  <p>暫無相關新聞</p>
                </div>
                <div v-else class="news-list">
                  <article 
                    v-for="news in newsData" 
                    :key="news.id"
                    class="news-item"
                    :class="{ expanded: expandedNews.has(news.id) }"
                  >
                    <div class="news-header" @click="toggleNews(news.id)">
                      <div class="news-meta">
                        <span class="news-source">{{ news.source }}</span>
                        <span class="news-time">{{ formatTime(news.publishedAt || news.time) }}</span>
                        <span class="news-sentiment" :class="news.sentiment">
                          {{ news.sentiment === 'positive' ? '正面' : news.sentiment === 'negative' ? '負面' : '中性' }}
                        </span>
                      </div>
                      <h3 class="news-title">{{ news.title }}</h3>
                      <i class="fas toggle-icon" :class="expandedNews.has(news.id) ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                    </div>
                    <transition name="expand">
                      <div v-if="expandedNews.has(news.id)" class="news-body">
                        <p>{{ news.summary }}</p>
                      </div>
                    </transition>
                  </article>
                </div>
              </div>

              <!-- 技術分析 -->
              <div v-if="mode === 'analysis'" class="content-section">
                <StockChartECharts v-if="stockData.symbol" :symbol="stockData.symbol" />
              </div>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
}

.drawer-panel {
  width: 600px;
  max-width: 90vw;
  height: 100%;
  background: linear-gradient(135deg, rgba(12, 22, 44, 0.98), rgba(16, 12, 48, 0.98));
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(100, 200, 255, 0.3);
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid rgba(100, 200, 255, 0.2);
  background: rgba(15, 23, 42, 0.6);
}

.drawer-title-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stock-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stock-title .symbol {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 12px rgba(100, 200, 255, 0.4);
}

.stock-title .name {
  font-size: 1rem;
  color: rgba(226, 232, 240, 0.8);
}

.stock-price-info {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.stock-price-info .price {
  font-size: 1.8rem;
  font-weight: 700;
  color: #fff;
}

.stock-price-info .change {
  font-size: 1.1rem;
  font-weight: 600;
}

.stock-price-info .change.positive {
  color: #4ade80;
}

.stock-price-info .change.negative {
  color: #f87171;
}

.close-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(100, 200, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(226, 232, 240, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
  transform: rotate(90deg);
}

.drawer-tabs {
  display: flex;
  gap: 4px;
  padding: 16px 28px;
  background: rgba(15, 23, 42, 0.4);
  border-bottom: 1px solid rgba(100, 200, 255, 0.15);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn:hover {
  background: rgba(100, 200, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(100, 200, 255, 0.3);
}

.tab-btn.active {
  background: rgba(100, 200, 255, 0.2);
  color: #fff;
  border-color: rgba(100, 200, 255, 0.5);
  box-shadow: 0 4px 16px rgba(100, 200, 255, 0.25);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}

.content-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(100, 200, 255, 0.3);
}

.section-title i {
  color: rgba(100, 200, 255, 0.8);
  font-size: 1.2rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 200, 255, 0.15);
  border-radius: 10px;
}

.info-item .label {
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-item .value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(100, 200, 255, 0.2);
  border-radius: 12px;
  transition: all 0.3s ease;
}

.metric-card:hover {
  background: rgba(15, 23, 42, 0.8);
  border-color: rgba(100, 200, 255, 0.4);
  transform: translateY(-2px);
}

.metric-label {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.7);
  letter-spacing: 0.03em;
}

.metric-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 10px rgba(100, 200, 255, 0.3);
}

.performance-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.performance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 200, 255, 0.15);
  border-radius: 10px;
  transition: all 0.3s ease;
}

.performance-item:hover {
  background: rgba(15, 23, 42, 0.7);
  border-color: rgba(100, 200, 255, 0.3);
}

.performance-item .period {
  font-size: 0.95rem;
  color: rgba(226, 232, 240, 0.8);
  font-weight: 500;
}

.performance-item .perf-value {
  font-size: 1.2rem;
  font-weight: 700;
}

.performance-item .perf-value.positive {
  color: #4ade80;
  text-shadow: 0 0 10px rgba(74, 222, 128, 0.3);
}

.performance-item .perf-value.negative {
  color: #f87171;
  text-shadow: 0 0 10px rgba(248, 113, 113, 0.3);
}

.news-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.news-item {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 200, 255, 0.15);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.news-item:hover {
  border-color: rgba(100, 200, 255, 0.3);
}

.news-header {
  padding: 16px 18px;
  cursor: pointer;
  position: relative;
  transition: background 0.3s ease;
}

.news-header:hover {
  background: rgba(100, 200, 255, 0.05);
}

.news-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.news-source {
  font-size: 0.8rem;
  color: rgba(100, 200, 255, 0.8);
  font-weight: 600;
}

.news-time {
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.5);
}

.news-sentiment {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.news-sentiment.positive {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.news-sentiment.negative {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
}

.news-sentiment.neutral {
  background: rgba(156, 163, 175, 0.2);
  color: #9ca3af;
}

.news-title {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  line-height: 1.5;
  margin: 0;
  padding-right: 30px;
}

.toggle-icon {
  position: absolute;
  right: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(100, 200, 255, 0.6);
  font-size: 0.9rem;
  transition: transform 0.3s ease;
}

.news-body {
  padding: 0 18px 16px;
  color: rgba(226, 232, 240, 0.8);
  line-height: 1.7;
  font-size: 0.95rem;
}

.analysis-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  background: rgba(15, 23, 42, 0.4);
  border: 2px dashed rgba(100, 200, 255, 0.3);
  border-radius: 16px;
  gap: 16px;
}

.analysis-placeholder i {
  font-size: 4rem;
  color: rgba(100, 200, 255, 0.4);
}

.analysis-placeholder p {
  font-size: 1.2rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.7);
  margin: 0;
}

.placeholder-text {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.5);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
}

.loading-state i {
  font-size: 2rem;
  color: rgba(100, 200, 255, 0.6);
}

.loading-state span {
  font-size: 0.95rem;
  color: rgba(226, 232, 240, 0.6);
}

.empty-state i {
  font-size: 3rem;
  color: rgba(100, 200, 255, 0.3);
}

.empty-state p {
  font-size: 1rem;
  color: rgba(226, 232, 240, 0.5);
  margin: 0;
}

/* Transitions */
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 500px;
  opacity: 1;
}

/* Scrollbar */
.drawer-content::-webkit-scrollbar {
  width: 8px;
}

.drawer-content::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 4px;
}

.drawer-content::-webkit-scrollbar-thumb {
  background: rgba(100, 200, 255, 0.3);
  border-radius: 4px;
}

.drawer-content::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 200, 255, 0.5);
}

@media (max-width: 768px) {
  .drawer-panel {
    width: 100%;
    max-width: 100vw;
  }
  
  .metrics-grid,
  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
