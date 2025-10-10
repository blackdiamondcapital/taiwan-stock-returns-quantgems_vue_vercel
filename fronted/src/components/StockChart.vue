<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { fetchStockPriceHistory } from '../services/api'

const props = defineProps({
  symbol: { type: String, required: true },
  period: { type: String, default: '1D' }
})

const chartData = ref([])
const loading = ref(false)
const canvas = ref(null)

const DEFAULT_PERIOD = '1D'
const periodOptions = [
  { key: 'day', period: '1D', label: '日K' },
  { key: 'week', period: '1W', label: '週K' },
  { key: 'month', period: '1M', label: '月K' },
  { key: 'threeMonth', period: '3M', label: '三月' },
  { key: 'halfYear', period: '6M', label: '半年' },
  { key: 'oneYear', period: '1Y', label: '一年' }
]

const periodKeyMap = new Map(periodOptions.map(option => [option.key, option]))
const periodValueMap = new Map(periodOptions.map(option => [option.period, option]))

function resolveInitialKey(initialPeriod) {
  if (periodValueMap.has(initialPeriod)) {
    return periodValueMap.get(initialPeriod).key
  }
  return periodOptions.find(option => option.period === DEFAULT_PERIOD)?.key ?? 'day'
}

const selectedPeriodKey = ref(resolveInitialKey(props.period))

async function loadChartData() {
  if (!props.symbol) return
  
  loading.value = true
  try {
    const option = periodKeyMap.get(selectedPeriodKey.value)
    const periodValue = option?.period ?? DEFAULT_PERIOD
    chartData.value = await fetchStockPriceHistory(props.symbol, periodValue)
    await drawChart()
  } catch (error) {
    console.error('StockChart: Error loading data', error)
  } finally {
    loading.value = false
  }
}

async function drawChart() {
  await nextTick()
  
  if (!canvas.value || chartData.value.length === 0) return
  
  // Ensure canvas is properly sized
  let offsetWidth = canvas.value.offsetWidth
  let offsetHeight = canvas.value.offsetHeight

  if (offsetWidth === 0 || offsetHeight === 0) {
    const rect = canvas.value.getBoundingClientRect()
    offsetWidth = rect.width || canvas.value.parentElement?.clientWidth || 600
    offsetHeight = rect.height || canvas.value.parentElement?.clientHeight || 360

    canvas.value.style.width = `${offsetWidth}px`
    canvas.value.style.height = `${offsetHeight}px`
  }
  
  canvas.value.width = offsetWidth * 2
  canvas.value.height = offsetHeight * 2
  const ctx = canvas.value.getContext('2d')
  ctx.scale(2, 2)
  
  const width = offsetWidth
  const height = offsetHeight
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height)
  
  // Calculate dimensions
  const padding = { top: 20, right: 60, bottom: 40, left: 10 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  
  // Find min and max prices
  const prices = chartData.value.flatMap(d => [d.high, d.low])
  const minPrice = Math.min(...prices) * 0.98
  const maxPrice = Math.max(...prices) * 1.02
  const priceRange = maxPrice - minPrice
  
  const candleWidth = chartWidth / chartData.value.length * 0.7
  const candleSpacing = chartWidth / chartData.value.length
  
  // Draw background grid
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.1)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartHeight / 5) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
    
    // Price labels
    const price = maxPrice - (priceRange / 5) * i
    ctx.fillStyle = 'rgba(226, 232, 240, 0.6)'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(price.toFixed(2), width - padding.right + 8, y + 4)
  }
  
  // Draw candlesticks
  chartData.value.forEach((candle, index) => {
    const x = padding.left + index * candleSpacing + candleSpacing / 2
    const openY = padding.top + ((maxPrice - candle.open) / priceRange) * chartHeight
    const closeY = padding.top + ((maxPrice - candle.close) / priceRange) * chartHeight
    const highY = padding.top + ((maxPrice - candle.high) / priceRange) * chartHeight
    const lowY = padding.top + ((maxPrice - candle.low) / priceRange) * chartHeight
    
    const isGreen = candle.close >= candle.open
    ctx.strokeStyle = isGreen ? '#4ade80' : '#f87171'
    ctx.fillStyle = isGreen ? '#4ade80' : '#f87171'
    
    // Draw wick
    ctx.beginPath()
    ctx.moveTo(x, highY)
    ctx.lineTo(x, lowY)
    ctx.lineWidth = 1
    ctx.stroke()
    
    // Draw body
    const bodyTop = Math.min(openY, closeY)
    const bodyHeight = Math.abs(closeY - openY) || 1
    
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight)
  })
  
  // Draw volume bars
  const volumes = chartData.value.map(d => d.volume)
  const maxVolume = Math.max(...volumes)
  const volumeHeight = 60
  const volumeTop = height - padding.bottom
  
  chartData.value.forEach((candle, index) => {
    const x = padding.left + index * candleSpacing + candleSpacing / 2
    const barHeight = (candle.volume / maxVolume) * volumeHeight
    const isGreen = candle.close >= candle.open
    
    ctx.fillStyle = isGreen ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)'
    ctx.fillRect(x - candleWidth / 2, volumeTop - barHeight, candleWidth, barHeight)
  })
}

function changePeriod(key) {
  if (!periodKeyMap.has(key)) return
  selectedPeriodKey.value = key
  loadChartData()
}

watch(() => props.symbol, () => {
  if (props.symbol) {
    loadChartData()
  }
})

onMounted(async () => {
  await nextTick()
  loadChartData()
})
</script>

<template>
  <div class="stock-chart">
    <div class="chart-header">
      <div class="chart-title">
        <i class="fas fa-chart-candlestick"></i>
        <span>{{ symbol }} K線圖</span>
      </div>
      <div class="period-selector">
        <button
          v-for="option in periodOptions"
          :key="option.value"
          class="period-btn"
          :class="{ active: selectedPeriod === option.value }"
          @click="changePeriod(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
    
    <div v-if="loading" class="chart-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>載入中...</span>
    </div>
    
    <div v-else-if="chartData.length === 0" class="chart-empty">
      <i class="fas fa-chart-line"></i>
      <p>暫無圖表數據</p>
      <span>資料載入失敗或該股票無歷史數據</span>
    </div>
    
    <div v-else class="chart-container">
      <canvas ref="canvas"></canvas>
    </div>
    
    <div class="chart-indicators">
      <div class="indicator-item">
        <span class="indicator-label">技術指標</span>
        <span class="indicator-value">MA5 / MA10 / MA20</span>
      </div>
      <div class="indicator-info">
        <i class="fas fa-info-circle"></i>
        <span>更多技術指標開發中...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stock-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
}

.chart-title i {
  color: rgba(100, 200, 255, 0.8);
}

.period-selector {
  display: flex;
  gap: 6px;
}

.period-btn {
  padding: 6px 14px;
  border: 1px solid rgba(100, 200, 255, 0.3);
  border-radius: 6px;
  background: transparent;
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s ease;
}

.period-btn:hover {
  background: rgba(100, 200, 255, 0.1);
  border-color: rgba(100, 200, 255, 0.5);
  color: #fff;
}

.period-btn.active {
  background: rgba(100, 200, 255, 0.2);
  border-color: rgba(100, 200, 255, 0.6);
  color: #fff;
  box-shadow: 0 4px 12px rgba(100, 200, 255, 0.25);
}

.chart-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  gap: 12px;
}

.chart-loading i {
  font-size: 2rem;
  color: rgba(100, 200, 255, 0.6);
}

.chart-loading span {
  font-size: 0.95rem;
  color: rgba(226, 232, 240, 0.6);
}

.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  gap: 12px;
  background: rgba(15, 23, 42, 0.4);
  border: 2px dashed rgba(100, 200, 255, 0.2);
  border-radius: 12px;
}

.chart-empty i {
  font-size: 3rem;
  color: rgba(100, 200, 255, 0.4);
}

.chart-empty p {
  font-size: 1.1rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.7);
  margin: 0;
}

.chart-empty span {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.5);
}

.chart-container {
  position: relative;
  width: 100%;
  height: 400px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(100, 200, 255, 0.2);
  border-radius: 12px;
  overflow: hidden;
}

.chart-container canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.chart-indicators {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(100, 200, 255, 0.15);
  border-radius: 10px;
  flex-wrap: wrap;
  gap: 12px;
}

.indicator-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.indicator-label {
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.indicator-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: rgba(100, 200, 255, 0.9);
}

.indicator-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.5);
}

.indicator-info i {
  color: rgba(100, 200, 255, 0.5);
}

@media (max-width: 640px) {
  .chart-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .period-selector {
    justify-content: space-between;
  }
  
  .period-btn {
    flex: 1;
  }
  
  .chart-container {
    height: 300px;
  }
}
</style>
