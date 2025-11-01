<script setup>
import { ref, computed, nextTick } from 'vue'
import StockChartECharts from './StockChartECharts.vue'
import { fetchStockPriceHistory, fetchStockQuote } from '../services/api'

const stockSymbol = ref('')
const searchedSymbol = ref('')
const stockName = ref('')
const showChart = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)
const noDataWarning = ref(false)
const chartKey = ref(0)
const chartRef = ref(null)

// 常見台股代號建議
const popularStocks = [
  { symbol: '2330', name: '台積電' },
  { symbol: '2317', name: '鴻海' },
  { symbol: '2454', name: '聯發科' },
  { symbol: '2308', name: '台達電' },
  { symbol: '2882', name: '國泰金' },
  { symbol: '2412', name: '中華電' },
  { symbol: '2886', name: '兆豐金' },
  { symbol: '2891', name: '中信金' },
  { symbol: '1301', name: '台塑' },
  { symbol: '1303', name: '南亞' }
]

const filteredSuggestions = computed(() => {
  if (!stockSymbol.value) return []
  const query = stockSymbol.value.toLowerCase()
  return popularStocks.filter(stock => 
    stock.symbol.includes(query) || 
    stock.name.toLowerCase().includes(query)
  ).slice(0, 5)
})

function selectStock(symbol) {
  stockSymbol.value = symbol
  // Find stock name from popular stocks
  const stock = popularStocks.find(s => s.symbol === symbol)
  if (stock) {
    stockName.value = stock.name
  }
  searchStock()
}

async function searchStock(fromFullscreen = false) {
  errorMessage.value = ''
  noDataWarning.value = false
  
  if (!stockSymbol.value.trim()) {
    errorMessage.value = '請輸入股票代號'
    showChart.value = false
    return
  }
  
  // 驗證股票代號格式（台股通常是4位數字）
  const symbol = stockSymbol.value.trim()
  if (!/^\d{4}$/.test(symbol)) {
    errorMessage.value = '請輸入有效的4位數股票代號'
    showChart.value = false
    return
  }
  
  // 先檢查是否有數據
  isLoading.value = true
  try {
    const candles = await fetchStockPriceHistory(symbol, '1D')
    if (!candles || candles.length === 0) {
      errorMessage.value = `股票代號 ${symbol} 目前無歷史數據，可能是：\n1. 股票代號不存在\n2. 該股票尚未有交易記錄\n3. 資料庫中無此股票資料`
      showChart.value = false
      return
    }
    
    searchedSymbol.value = symbol
    // Try to find stock name from popular stocks; fallback to quote API
    const stock = popularStocks.find(s => s.symbol === symbol)
    if (stock) {
      stockName.value = stock.name
    } else {
      try {
        const baseSym = String(symbol)
        const candidates = [baseSym, `${baseSym}.TW`, `${baseSym}.TWO`]
        let name = ''
        for (const s of candidates) {
          const q = await fetchStockQuote(s)
          name = q?.short_name || q?.name || ''
          if (name) break
        }
        stockName.value = name
      } catch (_) {
        stockName.value = ''
      }
    }
    showChart.value = true
    // 若不是全螢幕內查詢，透過 remount 以確保初次載入
    if (!fromFullscreen) {
      chartKey.value++
    }
    await nextTick()
    // 一般查詢完成後自動進入全螢幕
    if (!fromFullscreen && chartRef.value && typeof chartRef.value.enterFullscreen === 'function') {
      chartRef.value.enterFullscreen()
    }
  } catch (error) {
    console.error('檢查股票數據失敗:', error)
    errorMessage.value = '查詢失敗，請稍後再試'
    showChart.value = false
  } finally {
    isLoading.value = false
  }
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    searchStock(false)
  }
}

function clearSearch() {
  stockSymbol.value = ''
  searchedSymbol.value = ''
  showChart.value = false
  errorMessage.value = ''
  noDataWarning.value = false
  isLoading.value = false
}

async function onChartSearchSymbol(sym) {
  stockSymbol.value = sym
  // 來自全螢幕的查詢：不 remount，避免退出全螢幕
  await searchStock(true)
  // 若因為任何原因退出了全螢幕，重新進入
  await nextTick()
  if (chartRef.value && typeof chartRef.value.enterFullscreen === 'function') {
    chartRef.value.enterFullscreen()
  }
}
</script>

<template>
  <div class="stock-query-container">
    <!-- 標題區 -->
    <div class="query-header">
      <div class="header-content">
        <i class="fas fa-search-dollar"></i>
        <h2>股票技術分析查詢</h2>
      </div>
      <p class="header-subtitle">輸入股票代號，查看完整技術分析圖表</p>
    </div>

    <!-- 搜尋區 -->
    <div class="search-section">
      <div class="search-box">
        <div class="input-wrapper">
          <i class="fas fa-chart-line search-icon"></i>
          <input
            v-model="stockSymbol"
            type="text"
            placeholder="請輸入股票代號（例如：2330）"
            class="stock-input"
            @keypress="handleKeyPress"
            maxlength="4"
          />
          <button 
            v-if="stockSymbol" 
            class="clear-btn"
            @click="clearSearch"
            title="清除"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
        <button class="search-btn" @click="searchStock" :disabled="isLoading">
          <i v-if="!isLoading" class="fas fa-search"></i>
          <i v-else class="fas fa-spinner fa-spin"></i>
          <span>{{ isLoading ? '查詢中...' : '查詢' }}</span>
        </button>
      </div>

      <!-- 錯誤訊息 -->
      <div v-if="errorMessage" class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <span>{{ errorMessage }}</span>
      </div>

      <!-- 搜尋建議 -->
      <div v-if="filteredSuggestions.length > 0 && !showChart" class="suggestions">
        <div class="suggestions-label">熱門股票：</div>
        <div class="suggestion-chips">
          <button
            v-for="stock in filteredSuggestions"
            :key="stock.symbol"
            class="suggestion-chip"
            @click="selectStock(stock.symbol)"
          >
            <span class="chip-symbol">{{ stock.symbol }}</span>
            <span class="chip-name">{{ stock.name }}</span>
          </button>
        </div>
      </div>

      <!-- 常用股票快速選擇 -->
      <div v-if="!stockSymbol && !showChart" class="popular-stocks">
        <div class="popular-label">
          <i class="fas fa-star"></i>
          <span>熱門股票</span>
        </div>
        <div class="popular-grid">
          <button
            v-for="stock in popularStocks"
            :key="stock.symbol"
            class="popular-stock-btn"
            @click="selectStock(stock.symbol)"
          >
            <div class="stock-symbol">{{ stock.symbol }}</div>
            <div class="stock-name">{{ stock.name }}</div>
          </button>
        </div>
      </div>
    </div>

    <!-- 圖表顯示區 -->
    <div v-if="showChart" class="chart-section">
      <div class="chart-header-info">
        <div class="stock-info">
          <span class="info-label">查詢股票：</span>
          <span class="info-value">{{ searchedSymbol }}</span>
        </div>
        <button class="new-search-btn" @click="clearSearch">
          <i class="fas fa-redo"></i>
          <span>重新查詢</span>
        </button>
      </div>
      
      <div class="chart-wrapper">
        <StockChartECharts
          ref="chartRef"
          :key="chartKey"
          :symbol="searchedSymbol"
          :stockName="stockName"
          :period="'1D'"
          @search-symbol="onChartSearchSymbol"
        />
      </div>
    </div>

    <!-- 空狀態提示 -->
    <div v-if="!showChart && !stockSymbol" class="empty-state">
      <div class="empty-icon">
        <i class="fas fa-chart-candlestick"></i>
      </div>
      <h3>開始查詢股票技術分析</h3>
      <p>輸入股票代號或選擇熱門股票，即可查看完整的K線圖與技術指標</p>
      <div class="features">
        <div class="feature-item">
          <i class="fas fa-check-circle"></i>
          <span>即時K線圖表</span>
        </div>
        <div class="feature-item">
          <i class="fas fa-check-circle"></i>
          <span>多種技術指標</span>
        </div>
        <div class="feature-item">
          <i class="fas fa-check-circle"></i>
          <span>多週期切換</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stock-query-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

/* 標題區 */
.query-header {
  text-align: center;
  margin-bottom: 3rem;
  padding: 2rem;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%);
  border-radius: 16px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.header-content i {
  font-size: 2rem;
  color: #3b82f6;
}

.query-header h2 {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, #3b82f6 0%, #9333ea 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-subtitle {
  margin: 0;
  color: rgba(226, 232, 240, 0.7);
  font-size: 1rem;
}

/* 搜尋區 */
.search-section {
  margin-bottom: 2rem;
}

.search-box {
  display: flex;
  gap: 1rem;
  max-width: 600px;
  margin: 0 auto 1.5rem;
}

.input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 1rem;
  color: rgba(226, 232, 240, 0.5);
  font-size: 1.1rem;
}

.stock-input {
  width: 100%;
  padding: 1rem 3rem 1rem 3rem;
  font-size: 1.1rem;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  transition: all 0.3s ease;
}

.stock-input:focus {
  outline: none;
  border-color: #3b82f6;
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.clear-btn {
  position: absolute;
  right: 1rem;
  background: none;
  border: none;
  color: rgba(226, 232, 240, 0.5);
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.clear-btn:hover {
  color: #ef4444;
}

.search-btn {
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.search-btn:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.search-btn:active {
  transform: translateY(0);
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* 錯誤訊息 */
.error-message {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  color: #fca5a5;
  max-width: 600px;
  margin: 0 auto 1rem;
  line-height: 1.6;
}

.error-message i {
  flex-shrink: 0;
  margin-top: 0.2rem;
  font-size: 1.1rem;
}

.error-message span {
  white-space: pre-line;
  text-align: left;
  flex: 1;
}

/* 搜尋建議 */
.suggestions {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.suggestions-label {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.7);
  margin-bottom: 0.75rem;
}

.suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.suggestion-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 20px;
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.suggestion-chip:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  transform: translateY(-2px);
}

.chip-symbol {
  font-weight: 700;
  color: #3b82f6;
}

.chip-name {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.8);
}

/* 熱門股票 */
.popular-stocks {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1.5rem;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 16px;
  border: 1px solid rgba(100, 200, 255, 0.1);
}

.popular-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: #e2e8f0;
}

.popular-label i {
  color: #fbbf24;
}

.popular-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.popular-stock-btn {
  padding: 1rem;
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
}

.popular-stock-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.2);
}

.stock-symbol {
  font-size: 1.2rem;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 0.25rem;
}

.stock-name {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.7);
}

/* 圖表區 */
.chart-section {
  margin-top: 2rem;
}

.chart-header-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1rem 1.5rem;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.stock-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-label {
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.95rem;
}

.info-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: #3b82f6;
}

.new-search-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  color: #3b82f6;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.new-search-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
}

.chart-wrapper {
  background: rgba(15, 23, 42, 0.4);
  border-radius: 16px;
  padding: 1rem;
  border: 1px solid rgba(100, 200, 255, 0.1);
}

/* 空狀態 */
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: rgba(226, 232, 240, 0.7);
}

.empty-icon {
  font-size: 4rem;
  color: rgba(59, 130, 246, 0.3);
  margin-bottom: 1.5rem;
}

.empty-state h3 {
  font-size: 1.5rem;
  color: #e2e8f0;
  margin-bottom: 0.5rem;
}

.empty-state p {
  font-size: 1rem;
  margin-bottom: 2rem;
}

.features {
  display: flex;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
  margin-top: 2rem;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: rgba(226, 232, 240, 0.8);
}

.feature-item i {
  color: #10b981;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .stock-query-container {
    padding: 1rem;
  }

  .query-header h2 {
    font-size: 1.5rem;
  }

  .search-box {
    flex-direction: column;
  }

  .popular-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }

  .chart-header-info {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .features {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>
