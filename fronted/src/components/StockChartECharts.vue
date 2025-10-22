<script setup>
import { ref, onMounted, watch, onUnmounted, nextTick, computed } from 'vue'
import * as echarts from 'echarts'
import { fetchStockPriceHistory } from '../services/api'

const props = defineProps({
  symbol: { type: String, required: true },
  period: { type: String, default: '1D' }
})

const chartData = ref([])
const loading = ref(false)
const chartContainer = ref(null)
let chartInstance = null

// chart mode: 'standard' | 'heikin'
const chartMode = ref('standard')

// Control panel state
const controlPanelOpen = ref(localStorage.getItem('chartControlPanelOpen') === 'true')

function toggleControlPanel() {
  controlPanelOpen.value = !controlPanelOpen.value
  localStorage.setItem('chartControlPanelOpen', controlPanelOpen.value.toString())
}

const DEFAULT_PERIOD = '1D'
const periodOptions = [
  { key: 'day', period: '1D', label: '日K' },
  { key: 'week', period: '1W', label: '週K' },
  { key: 'month', period: '1M', label: '月K' },
  { key: 'halfYear', period: '6M', label: '半年K' },
  { key: 'oneYear', period: '1Y', label: '一年K' },
  { key: 'twoYear', period: '2Y', label: '兩年K' }
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
  } catch (error) {
    console.error('StockChart: Error loading data', error)
  } finally {
    loading.value = false
  }
}

function renderChart() {
  if (!chartContainer.value || chartData.value.length === 0) {
    return
  }
  
  // Initialize chart instance
  if (!chartInstance) {
    try {
      chartInstance = echarts.init(chartContainer.value)
    } catch (e) {
      console.error('Failed to initialize ECharts:', e)
      return
    }
  }
  
  // Prepare data for ECharts
  const dates = chartData.value.map(d => d.time)

  // Build OHLC according to selected mode
  const buildHeikinAshi = (rows) => {
    const ha = []
    for (let i = 0; i < rows.length; i++) {
      const { open, high, low, close } = rows[i]
      const haClose = (open + high + low + close) / 4
      const prev = ha[i - 1]
      const prevHaOpen = prev ? prev[0] : open
      const prevHaClose = prev ? prev[1] : close
      const haOpen = (prevHaOpen + prevHaClose) / 2
      const haHigh = Math.max(high, haOpen, haClose)
      const haLow = Math.min(low, haOpen, haClose)
      // Keep order [open, close, low, high]
      ha.push([Number(haOpen.toFixed(4)), Number(haClose.toFixed(4)), Number(haLow.toFixed(4)), Number(haHigh.toFixed(4))])
    }
    return ha
  }

  const standardOhlc = chartData.value.map(d => [d.open, d.close, d.low, d.high])
  const ohlc = chartMode.value === 'heikin' ? buildHeikinAshi(chartData.value) : standardOhlc
  const volumes = chartData.value.map(d => d.volume)
  
  // Calculate MA lines (based on close price index=1)
  function calculateMA(data, dayCount) {
    const result = []
    for (let i = 0; i < data.length; i++) {
      if (i < dayCount - 1) {
        result.push('-')
        continue
      }
      let sum = 0
      for (let j = 0; j < dayCount; j++) {
        sum += data[i - j][1] // close price
      }
      result.push((sum / dayCount).toFixed(2))
    }
    return result
  }
  
  const ma5 = calculateMA(ohlc, 5)
  const ma10 = calculateMA(ohlc, 10)
  const ma20 = calculateMA(ohlc, 20)
  
  const option = {
    backgroundColor: 'transparent',
    animation: true,
    legend: {
      data: [chartMode.value === 'heikin' ? '神奇K線' : 'K线', 'MA5', 'MA10', 'MA20'],
      textStyle: {
        color: 'rgba(226, 232, 240, 0.8)',
        fontSize: 12
      },
      top: 10,
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      },
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(100, 200, 255, 0.5)',
      borderWidth: 1,
      textStyle: {
        color: '#fff'
      },
      formatter: function (params) {
        let result = `${params[0].axisValue}<br/>`
        const candleData = params[0].data
        if (candleData) {
          // data format: [open, close, low, high]
          result += `開盤: ${candleData[0]}<br/>`
          result += `收盤: ${candleData[1]}<br/>`
          result += `最低: ${candleData[2]}<br/>`
          result += `最高: ${candleData[3]}<br/>`
        }
        for (let i = 1; i < params.length - 1; i++) {
          if (params[i].value !== '-') {
            result += `${params[i].seriesName}: ${params[i].value}<br/>`
          }
        }
        if (params[params.length - 1]) {
          result += `成交量: ${Number(params[params.length - 1].value).toLocaleString()}`
        }
        return result
      }
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }]
    },
    grid: [
      {
        left: '5%',
        right: '5%',
        top: 60,
        bottom: 150
      },
      {
        left: '5%',
        right: '5%',
        height: 90,
        bottom: 60
      }
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 11,
          margin: 12,
          hideOverlap: true
        },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax'
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: { show: false },
        splitLine: { show: false }
      }
    ],
    yAxis: [
      {
        scale: true,
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(100, 200, 255, 0.03)', 'rgba(15, 23, 42, 0.1)']
          }
        },
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 11
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(100, 200, 255, 0.1)'
          }
        }
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLine: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: 0,
        end: 100
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        bottom: 18,
        height: 24,
        start: 0,
        end: 100,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        borderColor: 'rgba(100, 200, 255, 0.3)',
        fillerColor: 'rgba(100, 200, 255, 0.2)',
        handleStyle: {
          color: 'rgba(100, 200, 255, 0.6)'
        },
        textStyle: {
          color: 'rgba(226, 232, 240, 0.6)'
        }
      }
    ],
    series: [
      {
        name: chartMode.value === 'heikin' ? '神奇K線' : 'K线',
        type: 'candlestick',
        data: ohlc,
        itemStyle: {
          color: '#4ade80',
          color0: '#f87171',
          borderColor: '#4ade80',
          borderColor0: '#f87171'
        },
        emphasis: {
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 2
          }
        }
      },
      {
        name: 'MA5',
        type: 'line',
        data: ma5,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#3b82f6'
        },
        showSymbol: false
      },
      {
        name: 'MA10',
        type: 'line',
        data: ma10,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#a855f7'
        },
        showSymbol: false
      },
      {
        name: 'MA20',
        type: 'line',
        data: ma20,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#f59e0b'
        },
        showSymbol: false
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
        itemStyle: {
          color: function(params) {
            const dataIndex = params.dataIndex
            if (dataIndex < ohlc.length) {
              return ohlc[dataIndex][1] >= ohlc[dataIndex][0] 
                ? 'rgba(74, 222, 128, 0.5)' 
                : 'rgba(248, 113, 113, 0.5)'
            }
            return 'rgba(100, 200, 255, 0.3)'
          }
        }
      }
    ]
  }
  
  try {
    chartInstance.setOption(option, true)
    
    // Force resize
    setTimeout(() => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }, 100)
  } catch (e) {
    console.error('Failed to set chart option:', e)
  }
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

// Watch for data changes and render chart
watch(() => chartData.value.length, (newLen) => {
  if (newLen > 0) {
    renderChart()
  }
})

onMounted(async () => {
  await nextTick()
  loadChartData()
  
  // Handle window resize
  window.addEventListener('resize', () => {
    if (chartInstance) {
      chartInstance.resize()
    }
  })
  
  // Handle Esc key to close panel
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && controlPanelOpen.value) {
      toggleControlPanel()
    }
  })
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  window.removeEventListener('resize', () => {})
})
</script>

<template>
  <div class="stock-chart">
    <div class="chart-header">
      <div class="chart-title">
        <i class="fas fa-chart-candlestick"></i>
        <span>{{ symbol }} {{ chartMode === 'heikin' ? '神奇K線圖' : 'K線圖' }}</span>
      </div>
    </div>
    
    <div v-show="loading" class="chart-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>載入中...</span>
    </div>
    
    <div v-show="!loading && chartData.length === 0" class="chart-empty">
      <i class="fas fa-chart-line"></i>
      <p>暫無圖表數據</p>
      <span>資料載入失敗或該股票無歷史數據</span>
    </div>
    
    <div class="chart-wrapper" v-show="!loading && chartData.length > 0">
      <div ref="chartContainer" class="chart-container">
        <!-- ECharts will render here -->
      </div>
      
      <!-- Floating Gear Button -->
      <button class="gear-button" @click="toggleControlPanel" :class="{ active: controlPanelOpen }">
        <i class="fas fa-cog" :class="{ 'fa-spin': controlPanelOpen }"></i>
      </button>
      
      <!-- Floating Control Panel -->
      <transition name="panel-fade">
        <div v-show="controlPanelOpen" class="floating-panel" @click.stop>
          <div class="panel-header">
            <span class="panel-title">圖表控制</span>
            <button class="panel-close" @click="toggleControlPanel">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="panel-section">
            <label class="section-label">K線模式</label>
            <div class="mode-toggle-switch">
              <button 
                class="toggle-btn" 
                :class="{ active: chartMode === 'standard' }" 
                @click="chartMode = 'standard'; renderChart()"
              >
                <i class="fas fa-chart-bar"></i>
                <span>原始K線</span>
              </button>
              <button 
                class="toggle-btn" 
                :class="{ active: chartMode === 'heikin' }" 
                @click="chartMode = 'heikin'; renderChart()"
              >
                <i class="fas fa-magic"></i>
                <span>神奇K線</span>
              </button>
            </div>
          </div>
          
          <div class="panel-section">
            <label class="section-label">資料頻率</label>
            <div class="period-chips">
              <button
                v-for="option in periodOptions"
                :key="option.key"
                class="chip"
                :class="{ active: selectedPeriodKey === option.key }"
                @click="changePeriod(option.key)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </transition>
      
      <!-- Backdrop for closing panel -->
      <div v-if="controlPanelOpen" class="panel-backdrop" @click="toggleControlPanel"></div>
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

/* Floating Gear Button */
.gear-button {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(100, 200, 255, 0.4);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(16, 12, 48, 0.95));
  color: rgba(100, 200, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 20px rgba(100, 200, 255, 0.3);
  z-index: 100 !important;
  pointer-events: auto;
}

.gear-button:hover {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.15), rgba(100, 150, 255, 0.2));
  border-color: rgba(100, 200, 255, 0.5);
  color: rgba(100, 200, 255, 1);
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(100, 200, 255, 0.4);
}

.gear-button.active {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.25), rgba(100, 150, 255, 0.3));
  border-color: rgba(100, 200, 255, 0.6);
  color: #fff;
  box-shadow: 0 0 20px rgba(100, 200, 255, 0.5);
}

.gear-button i.fa-spin {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Floating Control Panel */
.floating-panel {
  position: fixed;
  top: 50%;
  right: 30px;
  transform: translateY(-50%);
  width: 280px;
  max-height: 70vh;
  overflow-y: auto;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(16, 12, 48, 0.98));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(100, 200, 255, 0.3);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 60px rgba(100, 200, 255, 0.2);
  z-index: 95;
  padding: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(100, 200, 255, 0.2);
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(100, 200, 255, 0.2);
  background: transparent;
  color: rgba(226, 232, 240, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.panel-close:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
}

.panel-section {
  margin-bottom: 20px;
}

.panel-section:last-child {
  margin-bottom: 0;
}

.section-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.7);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Mode Toggle Switch */
.mode-toggle-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.toggle-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid rgba(100, 200, 255, 0.25);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.5);
  color: rgba(226, 232, 240, 0.7);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-btn i {
  font-size: 1.2rem;
}

.toggle-btn span {
  font-size: 0.75rem;
  font-weight: 500;
}

.toggle-btn:hover {
  background: rgba(100, 200, 255, 0.1);
  border-color: rgba(100, 200, 255, 0.4);
  color: #fff;
  transform: translateY(-2px);
}

.toggle-btn.active {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.25), rgba(100, 150, 255, 0.3));
  border-color: rgba(100, 200, 255, 0.6);
  color: #fff;
  box-shadow: 0 0 16px rgba(100, 200, 255, 0.4), inset 0 1px 3px rgba(255, 255, 255, 0.1);
}

/* Period Chips */
.period-chips {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.chip {
  padding: 10px 8px;
  border: 1px solid rgba(100, 200, 255, 0.25);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.5);
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
}

.chip:hover {
  background: rgba(100, 200, 255, 0.15);
  border-color: rgba(100, 200, 255, 0.4);
  color: #fff;
  transform: translateY(-1px);
}

.chip.active {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.3), rgba(100, 150, 255, 0.35));
  border-color: rgba(100, 200, 255, 0.6);
  color: #fff;
  box-shadow: 0 0 12px rgba(100, 200, 255, 0.3);
  font-weight: 600;
}

/* Panel Backdrop */
.panel-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 90;
  cursor: pointer;
}

/* Panel Fade Animation */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.chart-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 500px;
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
  height: 500px;
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

.chart-wrapper {
  position: relative;
  width: 100%;
}

.chart-container {
  width: 100% !important;
  height: 500px !important;
  min-height: 500px !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  display: block !important;
  visibility: visible !important;
  position: relative !important;
}

.chart-info {
  display: flex;
  justify-content: center;
  padding: 8px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(100, 200, 255, 0.15);
  border-radius: 8px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.6);
}

.info-item i {
  color: rgba(100, 200, 255, 0.5);
}

@media (max-width: 640px) {
  .chart-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .chart-container {
    height: 400px !important;
    min-height: 400px !important;
  }
  
  /* Adjust floating panel for mobile */
  .floating-panel {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-height: 70vh;
    border-radius: 20px 20px 0 0;
    padding: 20px;
  }
  
  .gear-button {
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }
  
  .period-chips {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
