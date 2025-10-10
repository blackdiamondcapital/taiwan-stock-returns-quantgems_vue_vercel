<script setup>
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue'
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
  const ohlc = chartData.value.map(d => [d.open, d.close, d.low, d.high])
  const volumes = chartData.value.map(d => d.volume)
  
  // Calculate MA lines
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
      data: ['K线', 'MA5', 'MA10', 'MA20'],
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
          result += `開盤: ${candleData[1]}<br/>`
          result += `收盤: ${candleData[2]}<br/>`
          result += `最低: ${candleData[3]}<br/>`
          result += `最高: ${candleData[4]}<br/>`
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
        top: '15%',
        height: '55%'
      },
      {
        left: '5%',
        right: '5%',
        top: '75%',
        height: '15%'
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
          fontSize: 11
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
        bottom: '2%',
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
        name: 'K线',
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
        <span>{{ symbol }} K线图</span>
      </div>
      <div class="period-selector">
        <button
          v-for="option in periodOptions"
          :key="option.key"
          class="period-btn"
          :class="{ active: selectedPeriodKey === option.key }"
          @click="changePeriod(option.key)"
        >
          {{ option.label }}
        </button>
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
    
    <div ref="chartContainer" class="chart-container" v-show="!loading && chartData.length > 0">
      <!-- ECharts will render here -->
    </div>
    
    <div v-if="!loading && chartData.length > 0" class="chart-info">
      <div class="info-item">
        <i class="fas fa-info-circle"></i>
        <span>拖動圖表可縮放，滑鼠懸停查看詳情</span>
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

.chart-container {
  width: 100% !important;
  height: 500px !important;
  min-height: 500px !important;
  background: rgba(15, 23, 42, 0.3) !important;
  border: 1px solid rgba(100, 200, 255, 0.2) !important;
  border-radius: 12px !important;
  padding: 10px !important;
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
  
  .period-selector {
    justify-content: space-between;
  }
  
  .period-btn {
    flex: 1;
  }
  
  .chart-container {
    height: 400px;
    min-height: 400px;
  }
}
</style>
