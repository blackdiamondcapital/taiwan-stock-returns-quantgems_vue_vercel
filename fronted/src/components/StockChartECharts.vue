<script setup>
import { ref, onMounted, watch, onUnmounted, nextTick, computed } from 'vue'
import * as echarts from 'echarts'
import { fetchStockPriceHistory, fetchStockQuote, fetchRankings } from '../services/api'

const props = defineProps({
  symbol: { type: String, required: true },
  stockName: { type: String, default: '' },
  period: { type: String, default: '1D' }
})

const emit = defineEmits(['search-symbol'])

// Resolve stock name if not provided by parent
const resolvedName = ref('')
const displayName = computed(() => {
  return (props.stockName && props.stockName.trim()) ? props.stockName.trim() : resolvedName.value
})

async function resolveStockName(symbol) {
  try {
    if (!symbol) { resolvedName.value = ''; return }
    // If parent already provided, keep it
    if (props.stockName && props.stockName.trim()) { resolvedName.value = props.stockName.trim(); return }
    const baseSym = String(symbol).split('.')?.[0]
    const candidates = Array.from(new Set([
      String(symbol),
      baseSym,
      `${baseSym}.TW`,
      `${baseSym}.TWO`,
    ]))
    resolvedName.value = ''
    for (const s of candidates) {
      try {
        const quote = await fetchStockQuote(s)
        const name = quote?.name || quote?.short_name || ''
        if (name && name.trim()) { resolvedName.value = name.trim(); break }
      } catch (_) { /* ignore and try next */ }
    }
    if (!resolvedName.value) {
      // Fallback: try to find from rankings by matching symbol (ignore market suffix)
      const periods = ['daily','weekly','monthly']
      for (const p of periods) {
        const list = await fetchRankings({ period: p, market: 'all', limit: 300 })
        const found = Array.isArray(list) ? list.find(r => String(r.symbol).split('.')?.[0] === baseSym) : null
        if (found && (found.name || found.short_name)) {
          resolvedName.value = found.short_name || found.name
          break
        }
      }
    }
  } catch (e) {
    resolvedName.value = ''
  }
}

onMounted(async () => {
  await resolveStockName(props.symbol)
})

watch(() => props.symbol, async (newSymbol) => {
  await resolveStockName(newSymbol)
  await loadChartData()
  nextTick(() => renderChart())
})

watch(() => props.stockName, (newName) => {
  if (newName && newName.trim()) {
    resolvedName.value = newName.trim()
  }
})

const chartData = ref([])
const loading = ref(false)
const chartContainer = ref(null)
let chartInstance = null

// chart mode: 'standard' | 'heikin'
const chartMode = ref('standard')

const symbolInput = ref('')

// Indicator toggles
const showVolume = ref(localStorage.getItem('chartShowVolume') !== 'false')
const showKD = ref(localStorage.getItem('chartShowKD') === 'true')
const showMACD = ref(localStorage.getItem('chartShowMACD') === 'true')

// Fullscreen state
const isFullscreen = ref(false)

// KD Parameters
const kdParams = ref({
  period: parseInt(localStorage.getItem('chartKDPeriod') || '9'),
  k: parseInt(localStorage.getItem('chartKDK') || '3'),
  d: parseInt(localStorage.getItem('chartKDD') || '3')
})

// MACD Parameters
const macdParams = ref({
  fast: parseInt(localStorage.getItem('chartMACDFast') || '12'),
  slow: parseInt(localStorage.getItem('chartMACDSlow') || '26'),
  signal: parseInt(localStorage.getItem('chartMACDSignal') || '9')
})

// MA Parameters
const maParams = ref({
  ma1: parseInt(localStorage.getItem('chartMA1') || '5'),
  ma2: parseInt(localStorage.getItem('chartMA2') || '10'),
  ma3: parseInt(localStorage.getItem('chartMA3') || '20'),
  ma4: parseInt(localStorage.getItem('chartMA4') || '30'),
  ma5: parseInt(localStorage.getItem('chartMA5') || '60')
})

// Control panel state
const controlPanelOpen = ref(localStorage.getItem('chartControlPanelOpen') === 'true')

// Panel section collapse states
const panelSections = ref({
  ma: localStorage.getItem('chartPanelMA') === 'true',
  indicators: localStorage.getItem('chartPanelIndicators') === 'true'
})

function toggleControlPanel() {
  controlPanelOpen.value = !controlPanelOpen.value
  localStorage.setItem('chartControlPanelOpen', controlPanelOpen.value.toString())
}

function togglePanelSection(section) {
  panelSections.value[section] = !panelSections.value[section]
  localStorage.setItem(`chartPanel${section.charAt(0).toUpperCase() + section.slice(1)}`, panelSections.value[section].toString())
}

// Toggle fullscreen
function toggleFullscreen() {
  const chartElement = document.querySelector('.stock-chart')
  
  if (!isFullscreen.value) {
    // Enter fullscreen
    if (chartElement.requestFullscreen) {
      chartElement.requestFullscreen()
    } else if (chartElement.webkitRequestFullscreen) {
      chartElement.webkitRequestFullscreen()
    } else if (chartElement.msRequestFullscreen) {
      chartElement.msRequestFullscreen()
    }
    symbolInput.value = String(props.symbol || '')
    isFullscreen.value = true
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen()
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen()
    }
    isFullscreen.value = false
  }
}

function submitSymbolSearch() {
  const sym = String(symbolInput.value || '').trim()
  if (!/^\d{4}$/.test(sym)) return
  emit('search-symbol', sym)
}

function enterFullscreen() {
  if (!isFullscreen.value) {
    toggleFullscreen()
  } else {
    symbolInput.value = String(props.symbol || '')
  }
}

defineExpose({ enterFullscreen })

// Save KD parameters to localStorage
function saveKDParams() {
  localStorage.setItem('chartKDPeriod', kdParams.value.period.toString())
  localStorage.setItem('chartKDK', kdParams.value.k.toString())
  localStorage.setItem('chartKDD', kdParams.value.d.toString())
  renderChart()
}

// Save MACD parameters to localStorage
function saveMACDParams() {
  localStorage.setItem('chartMACDFast', macdParams.value.fast.toString())
  localStorage.setItem('chartMACDSlow', macdParams.value.slow.toString())
  localStorage.setItem('chartMACDSignal', macdParams.value.signal.toString())
  renderChart()
}

// Save MA parameters to localStorage
function saveMAParams() {
  localStorage.setItem('chartMA1', maParams.value.ma1.toString())
  localStorage.setItem('chartMA2', maParams.value.ma2.toString())
  localStorage.setItem('chartMA3', maParams.value.ma3.toString())
  localStorage.setItem('chartMA4', maParams.value.ma4.toString())
  localStorage.setItem('chartMA5', maParams.value.ma5.toString())
  renderChart()
}

const DEFAULT_PERIOD = '1D'
const periodOptions = [
  { key: 'day', period: '1D', label: '日K' },
  { key: 'week', period: '1W', label: '週K' },
  { key: 'month', period: '1M', label: '月K' },
  { key: 'halfYear', period: '6M', label: '半年K' },
  { key: 'oneYear', period: '1Y', label: '一年K' }
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
    console.log('Heikin Ashi OHLC:', ha) // Add debug logging
    return ha
  }

  // Log raw chart data
  if (chartData.value.length > 0) {
    console.log('=== Chart Component Debug ===');
    console.log('First chartData item:', chartData.value[0]);
  }
  
  // ECharts candlestick expects: [open, close, low, high]
  const standardOhlc = chartData.value.map(d => {
    const ohlc = [d.open, d.close, d.low, d.high]
    console.log('Building OHLC:', { raw: d, ohlc })
    return ohlc
  })
  console.log('Standard OHLC:', standardOhlc) // Add debug logging
  const ohlc = chartMode.value === 'heikin' ? buildHeikinAshi(chartData.value) : standardOhlc
  const volumes = chartData.value.map(d => d.volume)
  
  // Log constructed OHLC
  if (ohlc.length > 0) {
    console.log('First OHLC array [open, close, low, high]:', ohlc[0]);
    console.log('Expected format: [open, close, low, high]');
  }
  
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
  
  const ma1 = calculateMA(ohlc, maParams.value.ma1)
  const ma2 = calculateMA(ohlc, maParams.value.ma2)
  const ma3 = calculateMA(ohlc, maParams.value.ma3)
  const ma4 = calculateMA(ohlc, maParams.value.ma4)
  const ma5 = calculateMA(ohlc, maParams.value.ma5)
  
  // Calculate KD indicator
  function calculateKD(data, n = 9, m1 = 3, m2 = 3) {
    const k = []
    const d = []
    const rsv = []
    
    for (let i = 0; i < data.length; i++) {
      if (i < n - 1) {
        rsv.push('-')
        k.push('-')
        d.push('-')
        continue
      }
      
      // Find lowest low and highest high in the period
      let lowestLow = Infinity
      let highestHigh = -Infinity
      for (let j = 0; j < n; j++) {
        const candle = data[i - j]
        lowestLow = Math.min(lowestLow, candle[2])  // low
        highestHigh = Math.max(highestHigh, candle[3])  // high
      }
      
      // Calculate RSV
      const close = data[i][1]
      const rsvValue = highestHigh === lowestLow ? 0 : ((close - lowestLow) / (highestHigh - lowestLow)) * 100
      rsv.push(rsvValue)
      
      // Calculate K (smoothed RSV)
      const prevK = k.length > 0 && k[k.length - 1] !== '-' ? k[k.length - 1] : 50
      const kValue = (prevK * (m1 - 1) + rsvValue) / m1
      k.push(kValue)
      
      // Calculate D (smoothed K)
      const prevD = d.length > 0 && d[d.length - 1] !== '-' ? d[d.length - 1] : 50
      const dValue = (prevD * (m2 - 1) + kValue) / m2
      d.push(dValue)
    }
    
    return { k, d }
  }
  
  // Calculate MACD indicator
  function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const closes = data.map(d => d[1])  // close price
    
    // Calculate EMA
    function calculateEMA(prices, period) {
      const ema = []
      const multiplier = 2 / (period + 1)
      
      for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
          ema.push('-')
          continue
        }
        
        if (i === period - 1) {
          // First EMA is SMA
          let sum = 0
          for (let j = 0; j < period; j++) {
            sum += prices[i - j]
          }
          ema.push(sum / period)
        } else {
          // EMA = (Close - EMA(previous day)) × multiplier + EMA(previous day)
          const prevEMA = ema[ema.length - 1]
          ema.push((prices[i] - prevEMA) * multiplier + prevEMA)
        }
      }
      
      return ema
    }
    
    const fastEMA = calculateEMA(closes, fastPeriod)
    const slowEMA = calculateEMA(closes, slowPeriod)
    
    // Calculate MACD line
    const macdLine = []
    for (let i = 0; i < closes.length; i++) {
      if (fastEMA[i] === '-' || slowEMA[i] === '-') {
        macdLine.push('-')
      } else {
        macdLine.push(fastEMA[i] - slowEMA[i])
      }
    }
    
    // Calculate Signal line (EMA of MACD)
    const signal = []
    const validMacd = []
    let firstValidIndex = 0
    
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== '-') {
        validMacd.push(macdLine[i])
        if (validMacd.length === 1) firstValidIndex = i
        
        if (validMacd.length < signalPeriod) {
          signal.push('-')
        } else if (validMacd.length === signalPeriod) {
          const sum = validMacd.reduce((a, b) => a + b, 0)
          signal.push(sum / signalPeriod)
        } else {
          const multiplier = 2 / (signalPeriod + 1)
          const prevSignal = signal[signal.length - 1]
          signal.push((macdLine[i] - prevSignal) * multiplier + prevSignal)
        }
      } else {
        signal.push('-')
      }
    }
    
    // Calculate histogram
    const histogram = []
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] === '-' || signal[i] === '-') {
        histogram.push('-')
      } else {
        histogram.push(macdLine[i] - signal[i])
      }
    }
    
    return { macd: macdLine, signal, histogram }
  }
  
  const kdData = showKD.value ? calculateKD(ohlc, kdParams.value.period, kdParams.value.k, kdParams.value.d) : null
  const macdData = showMACD.value ? calculateMACD(ohlc, macdParams.value.fast, macdParams.value.slow, macdParams.value.signal) : null
  
  // Debug: Log MACD data availability
  if (macdData && showMACD.value) {
    const validMacdCount = macdData.macd.filter(v => v !== '-').length
    const validSignalCount = macdData.signal.filter(v => v !== '-').length
    const totalDataPoints = ohlc.length
    const requiredPoints = macdParams.value.slow + macdParams.value.signal
    console.log(`MACD Debug: Total data=${totalDataPoints}, Required=${requiredPoints}, Valid MACD=${validMacdCount}, Valid Signal=${validSignalCount}`)
    if (totalDataPoints < requiredPoints) {
      console.warn(`⚠️ MACD 參數過大：需要至少 ${requiredPoints} 個數據點，但只有 ${totalDataPoints} 個`)
    }
  }
  
  // Unified MACD scale for all periods (day/week/month): symmetric around 0
  let macdScale = 1
  if (macdData) {
    const macdVals = [...macdData.macd, ...macdData.signal, ...macdData.histogram]
      .filter(v => v !== '-' && v !== null && v !== undefined)
      .map(v => Math.abs(Number(v)))
    const absMax = macdVals.length ? Math.max(...macdVals) : 1
    macdScale = absMax === 0 ? 1 : absMax * 1.2
  }

  // Pixel-based layout to prevent subplot overlap
  const container = chartContainer.value
  // Prefer ECharts internal canvas height for precise pixel layout
  const H = (chartInstance && typeof chartInstance.getHeight === 'function')
    ? chartInstance.getHeight()
    : (container?.clientHeight || 600)
  const gapPx = 18
  const legendBandPx = 22
  const topMain = 50
  const mainHeightPx = (showKD.value || showMACD.value || showVolume.value) ? Math.round(H * 0.44) : Math.round(H * 0.86)

  const grids = []
  grids.push({ left: '5%', right: '8%', top: topMain, height: mainHeightPx, containLabel: true, borderWidth: 1, borderColor: 'rgba(100, 200, 255, 0.2)' })

  let nextTop = topMain + mainHeightPx + gapPx
  let kdLegendTopPx, macdLegendTopPx
  if (showKD.value) {
    kdLegendTopPx = nextTop
    const kdTopPx = kdLegendTopPx + legendBandPx
    const kdHeightPx = Math.round(H * 0.18)
    grids.push({ left: '5%', right: '8%', top: kdTopPx, height: kdHeightPx, containLabel: true, borderWidth: 1, borderColor: 'rgba(100, 200, 255, 0.2)', backgroundColor: 'rgba(15,23,42,0.35)' })
    nextTop = kdTopPx + kdHeightPx + gapPx
  }
  if (showMACD.value) {
    macdLegendTopPx = nextTop
    const macdTopPx = macdLegendTopPx + legendBandPx
    const macdHeightPx = Math.round(H * 0.17)
    grids.push({ left: '5%', right: '8%', top: macdTopPx, height: macdHeightPx, containLabel: true, borderWidth: 1, borderColor: 'rgba(100, 200, 255, 0.2)', backgroundColor: 'rgba(15,23,42,0.35)' })
    nextTop = macdTopPx + macdHeightPx + gapPx
  }
  if (showVolume.value) {
    let volTopPx = nextTop
    // Dynamic volume height ratio: more subplots -> still give volume enough height
    const volHeightRatio = (showKD.value && showMACD.value) ? 0.10 : ((showKD.value || showMACD.value) ? 0.12 : 0.16)
    let volHeightPx = Math.max(80, Math.round(H * volHeightRatio))
    // Hard clamp to ensure last grid fits inside canvas with minimal gap from bottom
    const bottomPadding = 8
    if (volTopPx + volHeightPx > H - bottomPadding) {
      volHeightPx = Math.max(20, (H - bottomPadding) - volTopPx)
    }
    // Also ensure MACD bottom + gap <= volume top
    if (showMACD.value) {
      const macdGrid = grids[grids.length - 1]
      const macdBottom = macdGrid.top + macdGrid.height
      if (volTopPx < macdBottom + gapPx) {
        volTopPx = macdBottom + gapPx
      }
    }
    grids.push({ left: '5%', right: '8%', top: volTopPx, height: volHeightPx, containLabel: true, borderWidth: 1, borderColor: 'rgba(100, 200, 255, 0.2)', backgroundColor: 'rgba(15,23,42,0.35)' })
  }

  const kdLegendTop = showKD.value ? kdLegendTopPx : undefined
  const macdLegendTop = showMACD.value ? macdLegendTopPx : undefined

  // Unified grid indexes to avoid off-by-one mistakes
  const idxMain = 0
  const idxKD = showKD.value ? 1 : undefined
  const idxMACD = showMACD.value ? (showKD.value ? 2 : 1) : undefined
  const idxVol = showVolume.value ? ((showKD.value && showMACD.value) ? 3 : (showKD.value || showMACD.value) ? 2 : 1) : undefined

  // Build hard separators using graphic masks between subplots
  const separators = []
  const chartBg = '#0b1220' // close to tailwind slate-900/950
  function addSeparator(yPx, hPx) {
    separators.push({
      type: 'rect',
      silent: true,
      z: 20,
      left: '5%',
      right: '8%',
      top: yPx,
      shape: { width: '100%', height: hPx },
      style: { fill: chartBg }
    })
  }
  
  // Add warning text if MACD parameters are too large
  if (showMACD.value && macdData) {
    const validMacdCount = macdData.macd.filter(v => v !== '-').length
    const totalDataPoints = ohlc.length
    const requiredPoints = macdParams.value.slow + macdParams.value.signal
    const dataPercentage = totalDataPoints > 0 ? (validMacdCount / totalDataPoints * 100).toFixed(0) : 0
    
    if (totalDataPoints < requiredPoints || dataPercentage < 50) {
      const macdGrid = grids[idxMACD]
      separators.push({
        type: 'text',
        z: 100,
        left: 'center',
        top: macdGrid.top + macdGrid.height / 2 - 20,
        style: {
          text: `⚠️ MACD 參數過大\n需要 ${requiredPoints} 個數據點，目前只有 ${totalDataPoints} 個\n僅 ${dataPercentage}% 的數據可顯示`,
          font: 'bold 14px sans-serif',
          fill: 'rgba(245, 158, 11, 0.9)',
          textAlign: 'center',
          textVerticalAlign: 'middle'
        }
      })
    }
  }
  // After main -> before KD (legend band already occupies here)
  if (showKD.value) {
    addSeparator(kdLegendTopPx - Math.floor((gapPx - 2) / 2), gapPx) // a little thicker than gap
  }
  // Between KD and MACD
  if (showKD.value && showMACD.value) {
    const lastKD = grids[idxKD]
    addSeparator(lastKD.top + lastKD.height - Math.floor((gapPx - 2) / 2), gapPx)
  }
  // Between MACD and Volume
  if (showMACD.value && showVolume.value) {
    const macdG = grids[idxMACD]
    addSeparator(macdG.top + macdG.height - Math.floor((gapPx - 2) / 2), gapPx)
  }

  const option = {
    backgroundColor: 'transparent',
    animation: true,
    graphic: separators,
    legend: [
      {
        data: [`MA${maParams.value.ma1}`, `MA${maParams.value.ma2}`, `MA${maParams.value.ma3}`, `MA${maParams.value.ma4}`, `MA${maParams.value.ma5}`],
        top: 5,
        left: 'center',
        orient: 'horizontal',
        itemGap: 20,
        backgroundColor: 'transparent',
        borderRadius: 6,
        padding: [4, 12],
        textStyle: {
          color: 'rgba(226, 232, 240, 0.9)',
          fontSize: 11
        }
      },
      ...(showKD.value ? [{
        data: [
          {
            name: `KD(${kdParams.value.period},${kdParams.value.k},${kdParams.value.d}): K`,
            textStyle: {
              color: '#f59e0b',
              fontSize: 10,
              fontWeight: 500
            }
          },
          {
            name: `KD(${kdParams.value.period},${kdParams.value.k},${kdParams.value.d}): D`, 
            textStyle: {
              color: '#3b82f6',
              fontSize: 10,
              fontWeight: 500
            }
          }
        ],
        top: kdLegendTop,
        left: 'center',
        itemGap: 10,
        itemWidth: 18,
        itemHeight: 8,
        padding: [2, 8],
        icon: 'line',
        selectedMode: false
      }] : []),
      ...(showMACD.value ? [{
        data: [
          {
            name: `MACD(${macdParams.value.fast},${macdParams.value.slow},${macdParams.value.signal}): MACD`,
            textStyle: {
              color: '#3b82f6',
              fontSize: 10,
              fontWeight: 500
            }
          },
          {
            name: `MACD(${macdParams.value.fast},${macdParams.value.slow},${macdParams.value.signal}): Signal`,
            textStyle: {
              color: '#f59e0b',
              fontSize: 10,
              fontWeight: 500
            }
          },
          {
            name: `MACD(${macdParams.value.fast},${macdParams.value.slow},${macdParams.value.signal}): Histogram`,
            textStyle: {
              color: 'rgba(226, 232, 240, 0.8)',
              fontSize: 10,
              fontWeight: 500
            }
          }
        ],
        top: macdLegendTop,
        left: 'center',
        itemGap: 10,
        itemWidth: 18,
        itemHeight: 8,
        padding: [2, 8],
        icon: 'line',
        selectedMode: false
      }] : []),
    ],
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
        
        // Find the candlestick series
        const candleParam = params.find(p => p.seriesType === 'candlestick')
        console.log('=== Tooltip Debug ===')
        console.log('candleParam:', candleParam)
        console.log('candleParam.value:', candleParam?.value)
        console.log('candleParam.data:', candleParam?.data)
        
        if (candleParam) {
          // Try both value and data
          const dataArray = candleParam.value || candleParam.data
          console.log('Using dataArray:', dataArray)
          
          if (dataArray && Array.isArray(dataArray) && dataArray.length >= 5) {
            // ECharts candlestick format in tooltip: [?, open, close, low, high]
            // The first element appears to be an index or other value, actual OHLC starts at index 1
            const open = Number(dataArray[1]).toFixed(2)
            const close = Number(dataArray[2]).toFixed(2)
            const low = Number(dataArray[3]).toFixed(2)
            const high = Number(dataArray[4]).toFixed(2)
            
            console.log('Parsed OHLC:', { open, close, low, high })
            
            result += `開盤: ${open}<br/>`
            result += `收盤: ${close}<br/>`
            result += `最低: ${low}<br/>`
            result += `最高: ${high}<br/>`
          }
        }
        
        // Add MA lines
        for (let i = 0; i < params.length; i++) {
          const param = params[i]
          if (param.seriesType === 'line' && param.value !== '-' && param.value !== null && param.value !== undefined) {
            result += `${param.seriesName}: ${Number(param.value).toFixed(2)}<br/>`
          }
        }
        
        // Add volume (last series, type: 'bar')
        const volumeParam = params.find(p => p.seriesType === 'bar')
        if (volumeParam && volumeParam.value !== undefined) {
          result += `成交量: ${Number(volumeParam.value).toLocaleString()}`
        }
        
        return result
      }
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }]
    },
    grid: grids,
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: { show: false },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax'
      },
      ...(showKD.value ? [{
        type: 'category',
        gridIndex: idxKD,
        data: dates,
        boundaryGap: false,
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 11,
          margin: 12,
          hideOverlap: true,
          show: false
        },
        splitLine: { show: false }
      }] : []),
      ...(showMACD.value ? [{
        type: 'category',
        gridIndex: idxMACD,
        data: dates,
        boundaryGap: false,
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 11,
          margin: 12,
          hideOverlap: true,
          show: false
        },
        splitLine: { show: false }
      }] : []),
      ...(showVolume.value ? [{
        type: 'category',
        gridIndex: idxVol,
        data: dates,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 10,
          margin: 12,
          hideOverlap: true,
          show: true
        },
        splitLine: { show: false }
      }] : [])
    ],
    yAxis: [
      {
        scale: true,
        splitArea: {
          show: false
        },
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 11,
          width: 60,
          overflow: 'truncate',
          formatter: function (value) {
            return Number(value).toFixed(1)
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(100, 200, 255, 0.1)'
          }
        }
      },
      ...(showKD.value ? [{
        scale: true,
        gridIndex: idxKD,
        min: 0,
        max: 100,
        splitNumber: 2,
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 10,
          width: 60,
          overflow: 'truncate',
          formatter: function (value) {
            return Number(value).toFixed(0)
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(100, 200, 255, 0.1)'
          }
        }
      }] : []),
      ...(showMACD.value ? [{
        scale: true,
        gridIndex: idxMACD,
        splitNumber: 2,
        min: -macdScale,
        max: macdScale,
        boundaryGap: ['10%', '10%'],
        axisLine: { 
          lineStyle: { color: 'rgba(100, 200, 255, 0.3)' } 
        },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 10,
          width: 60,
          overflow: 'truncate',
          formatter: function (value) {
            return Number(value).toFixed(2)
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(100, 200, 255, 0.1)'
          }
        }
      }] : []),
      ...(showVolume.value ? [{
        scale: true,
        gridIndex: idxVol,
        splitNumber: 2,
        min: 0,
        axisLine: { show: false },
        axisLabel: {
          color: 'rgba(226, 232, 240, 0.6)',
          fontSize: 10,
          width: 60,
          overflow: 'truncate',
          formatter: function (value) {
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M'
            } else if (value >= 1000) {
              return (value / 1000).toFixed(0) + 'K'
            }
            return value.toString()
          }
        },
        splitLine: { show: false }
      }] : [])
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, ...(showKD.value ? [idxKD] : []), ...(showMACD.value ? [idxMACD] : []), ...(showVolume.value ? [idxVol] : [])],
        // 預設顯示最後 120 根K，留下空間可向左拖曳
        startValue: Math.max(0, dates.length - 120),
        endValue: Math.max(0, dates.length - 1),
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: true
      },
      {
        type: 'slider',
        xAxisIndex: [0, ...(showKD.value ? [idxKD] : []), ...(showMACD.value ? [idxMACD] : []), ...(showVolume.value ? [idxVol] : [])],
        startValue: Math.max(0, dates.length - 120),
        endValue: Math.max(0, dates.length - 1),
        bottom: 6,
        height: 18,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        fillerColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgba(100, 200, 255, 0.2)',
        handleStyle: { color: 'rgba(59, 130, 246, 0.8)' },
        textStyle: { color: 'rgba(226, 232, 240, 0.6)', fontSize: 10 }
      }
    ],
    series: [
      {
        name: chartMode.value === 'heikin' ? '神奇K線' : 'K线',
        type: 'candlestick',
        data: ohlc,
        itemStyle: {
          color: '#f87171',
          color0: '#4ade80',
          borderColor: '#f87171',
          borderColor0: '#4ade80'
        },
        emphasis: {
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 2
          }
        }
      },
      {
        name: `MA${maParams.value.ma1}`,
        type: 'line',
        data: ma1,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#3b82f6'
        },
        showSymbol: false
      },
      {
        name: `MA${maParams.value.ma2}`,
        type: 'line',
        data: ma2,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#a855f7'
        },
        showSymbol: false
      },
      {
        name: `MA${maParams.value.ma3}`,
        type: 'line',
        data: ma3,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#f59e0b'
        },
        showSymbol: false
      },
      {
        name: `MA${maParams.value.ma4}`,
        type: 'line',
        data: ma4,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#10b981'
        },
        showSymbol: false
      },
      {
        name: `MA${maParams.value.ma5}`,
        type: 'line',
        data: ma5,
        smooth: true,
        lineStyle: {
          width: 1.5,
          color: '#f97316'
        },
        showSymbol: false
      },
            ...(showKD.value && kdData ? [
        {
          name: `KD(${kdParams.value.period},${kdParams.value.k},${kdParams.value.d}): K`,
          type: 'line',
          xAxisIndex: idxKD,
          yAxisIndex: idxKD,
          data: kdData.k,
          smooth: true,
          clip: true,
          lineStyle: {
            width: 2,
            color: '#f59e0b'
          },
          showSymbol: false
        },
        {
          name: `KD(${kdParams.value.period},${kdParams.value.k},${kdParams.value.d}): D`,
          type: 'line',
          xAxisIndex: idxKD,
          yAxisIndex: idxKD,
          data: kdData.d,
          smooth: true,
          clip: true,
          lineStyle: {
            width: 2,
            color: '#3b82f6'
          },
          showSymbol: false
        }
      ] : []),
      ...(showMACD.value && macdData ? [
        {
          name: `MACD(${macdParams.value.fast},${macdParams.value.slow},${macdParams.value.signal}): MACD`,
          type: 'line',
          xAxisIndex: idxMACD,
          yAxisIndex: idxMACD,
          data: macdData.macd,
          smooth: true,
          clip: true,
          lineStyle: {
            width: 2,
            color: '#3b82f6'
          },
          showSymbol: false
        },
        {
          name: `MACD(${macdParams.value.fast},${macdParams.value.slow},${macdParams.value.signal}): Signal`,
          type: 'line',
          xAxisIndex: idxMACD,
          yAxisIndex: idxMACD,
          data: macdData.signal,
          smooth: true,
          clip: true,
          lineStyle: {
            width: 2,
            color: '#f59e0b'
          },
          showSymbol: false
        },
        {
          name: `MACD(${macdParams.value.fast},${macdParams.value.slow},${macdParams.value.signal}): Histogram`,
          type: 'bar',
          xAxisIndex: idxMACD,
          yAxisIndex: idxMACD,
          data: macdData.histogram,
          clip: true,
          itemStyle: {
            color: function(params) {
              return params.value > 0 ? 'rgba(248, 113, 113, 0.6)' : 'rgba(74, 222, 128, 0.6)'
            }
          }
        }
      ] : []),
      ...(showVolume.value ? [{
        name: '成交量',
        type: 'bar',
        xAxisIndex: idxVol,
        yAxisIndex: idxVol,
        data: volumes,
        clip: true,
        barWidth: '60%',
        barCategoryGap: '20%',
        itemStyle: {
          color: function(params) {
            const dataIndex = params.dataIndex
            if (dataIndex < ohlc.length) {
              return ohlc[dataIndex][1] >= ohlc[dataIndex][0] 
                ? 'rgba(248, 113, 113, 0.6)' 
                : 'rgba(74, 222, 128, 0.6)'
            }
            return 'rgba(100, 200, 255, 0.3)'
          }
        }
      }] : [])
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

watch(() => props.symbol, (newSymbol, oldSymbol) => {
  if (newSymbol && newSymbol !== oldSymbol) {
    // Reset to default period when symbol changes
    selectedPeriodKey.value = resolveInitialKey(props.period)
    // Clear existing data
    chartData.value = []
    // Load new data
    loadChartData()
  }
}, { immediate: false })

// Watch for data changes and render chart
watch(() => chartData.value.length, (newLen) => {
  if (newLen > 0) {
    renderChart()
  }
})

// Watch for indicator toggles
watch([showVolume, showKD, showMACD], () => {
  localStorage.setItem('chartShowVolume', showVolume.value.toString())
  localStorage.setItem('chartShowKD', showKD.value.toString())
  localStorage.setItem('chartShowMACD', showMACD.value.toString())
  if (chartData.value.length > 0) {
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
  
  // Listen for fullscreen changes
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
    // Delay chart resize to ensure DOM is updated
    setTimeout(() => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }, 100)
  })
  document.addEventListener('webkitfullscreenchange', () => {
    isFullscreen.value = !!document.webkitFullscreenElement
    setTimeout(() => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }, 100)
  })
  document.addEventListener('msfullscreenchange', () => {
    isFullscreen.value = !!document.msFullscreenElement
    setTimeout(() => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }, 100)
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
      <div class="header-row">
        <!-- 標題列 -->
        <div class="chart-title">
          <i class="fas fa-chart-candlestick"></i>
          <span>{{ symbol }}<template v-if="displayName"> {{ displayName }}</template> {{ chartMode === 'heikin' ? '神奇K線圖' : 'K線圖' }}</span>
        </div>
        
        <!-- 右側控制按鈕 -->
        <div class="header-actions">
          <button 
            class="action-icon-btn" 
            @click="toggleFullscreen"
            :title="isFullscreen ? '退出全螢幕' : '全螢幕'"
          >
            <i :class="isFullscreen ? 'fas fa-compress' : 'fas fa-expand'"></i>
          </button>
          
          <button 
            v-show="!controlPanelOpen" 
            class="action-icon-btn" 
            @click="toggleControlPanel"
            title="圖表控制"
          >
            <i class="fas fa-cog"></i>
          </button>
        </div>
      </div>
      
      <!-- 時間週期控制區 -->
      <div class="frequency-controls">
        <button
          v-for="option in periodOptions"
          :key="option.key"
          class="period-chip"
          :class="{ active: selectedPeriodKey === option.key }"
          @click="changePeriod(option.key)"
        >
          {{ option.label }}
        </button>
        
        <!-- 全螢幕下的代號查詢 -->
        <div v-if="isFullscreen" class="fullscreen-search-box">
          <i class="fas fa-search"></i>
          <input
            v-model="symbolInput"
            type="text"
            maxlength="4"
            placeholder="輸入代號例如 2330，按 Enter 查詢"
            @keyup.enter="submitSymbolSearch"
            class="fullscreen-search-input"
          />
          <button class="fullscreen-search-btn" @click="submitSymbolSearch">查詢</button>
        </div>

        <!-- K線模式切換 -->
        <div class="kline-mode-toggle">
          <button 
            class="mode-btn" 
            :class="{ active: chartMode === 'standard' }"
            @click="chartMode = 'standard'; renderChart()"
            title="原始K線"
          >
            <i class="fas fa-chart-bar"></i>
            <span>原始K線</span>
          </button>
          <button 
            class="mode-btn" 
            :class="{ active: chartMode === 'heikin' }"
            @click="chartMode = 'heikin'; renderChart()"
            title="神奇K線"
          >
            <i class="fas fa-magic"></i>
            <span>神奇K線</span>
          </button>
        </div>
        
        <!-- 全螢幕模式下顯示的按鈕 -->
        <div class="fullscreen-actions">
          <button 
            class="action-icon-btn" 
            @click="toggleFullscreen"
            :title="isFullscreen ? '退出全螢幕' : '全螢幕'"
          >
            <i :class="isFullscreen ? 'fas fa-compress' : 'fas fa-expand'"></i>
          </button>
          
          <button 
            v-show="!controlPanelOpen" 
            class="action-icon-btn" 
            @click="toggleControlPanel"
            title="圖表控制"
          >
            <i class="fas fa-cog"></i>
          </button>
        </div>
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
            <div class="section-header" @click="togglePanelSection('ma')">
              <label class="section-label">均線設定</label>
              <i class="fas fa-chevron-down section-toggle" :class="{ 'rotated': !panelSections.ma }"></i>
            </div>
            <transition name="collapse">
              <div class="parameter-controls" v-show="panelSections.ma">
              <div class="param-group">
                <label>MA1:</label>
                <input 
                  type="number" 
                  v-model.number="maParams.ma1" 
                  min="1" 
                  max="200" 
                  @change="saveMAParams"
                  class="param-input"
                />
              </div>
              <div class="param-group">
                <label>MA2:</label>
                <input 
                  type="number" 
                  v-model.number="maParams.ma2" 
                  min="1" 
                  max="200" 
                  @change="saveMAParams"
                  class="param-input"
                />
              </div>
              <div class="param-group">
                <label>MA3:</label>
                <input 
                  type="number" 
                  v-model.number="maParams.ma3" 
                  min="1" 
                  max="200" 
                  @change="saveMAParams"
                  class="param-input"
                />
              </div>
              <div class="param-group">
                <label>MA4:</label>
                <input 
                  type="number" 
                  v-model.number="maParams.ma4" 
                  min="1" 
                  max="200" 
                  @change="saveMAParams"
                  class="param-input"
                />
              </div>
              <div class="param-group">
                <label>MA5:</label>
                <input 
                  type="number" 
                  v-model.number="maParams.ma5" 
                  min="1" 
                  max="200" 
                  @change="saveMAParams"
                  class="param-input"
                />
              </div>
              </div>
            </transition>
          </div>
          
          <div class="panel-section">
            <div class="section-header" @click="togglePanelSection('indicators')">
              <label class="section-label">技術指標</label>
              <i class="fas fa-chevron-down section-toggle" :class="{ 'rotated': !panelSections.indicators }"></i>
            </div>
            <transition name="collapse">
              <div v-show="panelSections.indicators">
            <div class="indicator-toggles">
              <label class="indicator-toggle">
                <input 
                  type="checkbox" 
                  v-model="showKD"
                  class="toggle-checkbox"
                />
                <span class="toggle-label">
                  <i class="fas fa-chart-line"></i>
                  <span>KD指標</span>
                </span>
              </label>
              
              <!-- KD Parameters -->
              <div v-show="showKD" class="parameter-controls">
                <div class="param-group">
                  <label>週期:</label>
                  <input 
                    type="number" 
                    v-model.number="kdParams.period" 
                    min="5" 
                    max="50" 
                    @change="saveKDParams"
                    class="param-input"
                  />
                </div>
                <div class="param-group">
                  <label>K值:</label>
                  <input 
                    type="number" 
                    v-model.number="kdParams.k" 
                    min="1" 
                    max="10" 
                    @change="saveKDParams"
                    class="param-input"
                  />
                </div>
                <div class="param-group">
                  <label>D值:</label>
                  <input 
                    type="number" 
                    v-model.number="kdParams.d" 
                    min="1" 
                    max="10" 
                    @change="saveKDParams"
                    class="param-input"
                  />
                </div>
              </div>
              
              <label class="indicator-toggle">
                <input 
                  type="checkbox" 
                  v-model="showMACD"
                  class="toggle-checkbox"
                />
                <span class="toggle-label">
                  <i class="fas fa-chart-area"></i>
                  <span>MACD指標</span>
                </span>
              </label>
              
              <!-- MACD Parameters -->
              <div v-show="showMACD" class="parameter-controls">
                <div class="param-group">
                  <label>快線:</label>
                  <input 
                    type="number" 
                    v-model.number="macdParams.fast" 
                    min="5" 
                    max="200" 
                    @change="saveMACDParams"
                    class="param-input"
                  />
                </div>
                <div class="param-group">
                  <label>慢線:</label>
                  <input 
                    type="number" 
                    v-model.number="macdParams.slow" 
                    min="10" 
                    max="300" 
                    @change="saveMACDParams"
                    class="param-input"
                  />
                </div>
                <div class="param-group">
                  <label>信號:</label>
                  <input 
                    type="number" 
                    v-model.number="macdParams.signal" 
                    min="3" 
                    max="50" 
                    @change="saveMACDParams"
                    class="param-input"
                  />
                </div>
                <div v-if="chartData.length > 0 && (macdParams.slow + macdParams.signal) > chartData.length" class="param-warning">
                  <i class="fas fa-exclamation-triangle"></i>
                  <span>參數過大！需要至少 {{ macdParams.slow + macdParams.signal }} 個數據點，目前只有 {{ chartData.length }} 個</span>
                </div>
              </div>
              
              <label class="indicator-toggle">
                <input 
                  type="checkbox" 
                  v-model="showVolume"
                  class="toggle-checkbox"
                />
                <span class="toggle-label">
                  <i class="fas fa-chart-bar"></i>
                  <span>成交量</span>
                </span>
              </label>
            </div>
              </div>
            </transition>
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
  gap: 0;
  /* Remove any outer frame/glow on the container */
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(100, 200, 255, 0.15);
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.2rem;
  font-weight: 600;
  color: #fff;
}

.chart-title i {
  color: rgba(100, 200, 255, 0.8);
  font-size: 1.3rem;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.action-icon-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(100, 200, 255, 0.1);
  border: 1px solid rgba(100, 200, 255, 0.2);
  border-radius: 10px;
  color: rgba(226, 232, 240, 0.8);
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 1rem;
}

.action-icon-btn:hover {
  background: rgba(100, 200, 255, 0.2);
  border-color: rgba(100, 200, 255, 0.4);
  color: #64c8ff;
  transform: translateY(-2px);
}

.action-icon-btn:active {
  transform: translateY(0);
}

.chart-header {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: transparent;
  padding: 0;
  margin: 0 0 16px 0;
  border-bottom: none;
  box-shadow: none;
}

/* Frequency Controls */
.frequency-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-start;
  padding: 0 4px;
}

.period-chip {
  padding: 10px 20px;
  border: 1px solid rgba(100, 200, 255, 0.25);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.5);
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
  white-space: nowrap;
  min-width: 70px;
}

.period-chip:hover {
  background: rgba(100, 200, 255, 0.15);
  border-color: rgba(100, 200, 255, 0.4);
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(100, 200, 255, 0.2);
}

.period-chip.active {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(147, 51, 234, 0.9));
  border-color: rgba(59, 130, 246, 0.6);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
  transform: translateY(-2px);
}

/* K線模式切換 */
.kline-mode-toggle {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
  margin-right: 16px;
  padding: 4px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 24px;
  border: 1px solid rgba(100, 200, 255, 0.2);
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 20px;
  background: transparent;
  color: rgba(226, 232, 240, 0.6);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.mode-btn i {
  font-size: 0.9rem;
}

.mode-btn:hover {
  color: rgba(226, 232, 240, 0.9);
  background: rgba(100, 200, 255, 0.1);
  border-color: rgba(100, 200, 255, 0.2);
}

.mode-btn.active {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(147, 51, 234, 0.8));
  border-color: rgba(59, 130, 246, 0.5);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

/* Fullscreen actions container */
.fullscreen-actions {
  display: none;
  gap: 10px;
  align-items: center;
  margin-left: 16px;
}

/* Fullscreen search box */
.fullscreen-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid rgba(100, 200, 255, 0.25);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.6);
}

.fullscreen-search-box i {
  color: rgba(226, 232, 240, 0.7);
}

.fullscreen-search-input {
  width: 140px;
  background: transparent;
  border: none;
  outline: none;
  color: #e2e8f0;
  font-size: 0.95rem;
}

.fullscreen-search-btn {
  padding: 6px 12px;
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.15);
  color: #cbd5e1;
  border-radius: 16px;
  cursor: pointer;
}

/* Fullscreen Button */
.fullscreen-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(100, 200, 255, 0.1);
  border: 1px solid rgba(100, 200, 255, 0.2);
  color: rgba(100, 200, 255, 0.8);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
  margin-right: 8px;
}

.fullscreen-btn:hover {
  background: rgba(100, 200, 255, 0.15);
  border-color: rgba(100, 200, 255, 0.4);
  color: #fff;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(100, 200, 255, 0.2);
}

/* Chart Control Button */
.chart-control-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(100, 200, 255, 0.1);
  border: 1px solid rgba(100, 200, 255, 0.2);
  color: rgba(100, 200, 255, 0.8);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.chart-control-btn:hover {
  background: rgba(100, 200, 255, 0.15);
  border-color: rgba(100, 200, 255, 0.4);
  color: #fff;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(100, 200, 255, 0.2);
}

/* Fullscreen mode styles */
.stock-chart:fullscreen {
  background: rgba(15, 23, 42, 1);
  padding: 0;
  margin: 0;
}

.stock-chart:fullscreen .chart-header {
  position: relative !important;
  width: 100% !important;
  height: auto !important;
  padding: 20px !important;
  margin: 0 !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
}

.stock-chart:fullscreen .header-row {
  margin-bottom: 20px !important;
}

.stock-chart:fullscreen .chart-title {
  text-align: center !important;
  justify-content: center !important;
  font-size: 1.5rem !important;
}

.stock-chart:fullscreen .header-actions {
  display: none !important;
}

.stock-chart:fullscreen .frequency-controls {
  justify-content: center !important;
  align-items: center !important;
  gap: 12px !important;
}

.stock-chart:fullscreen .kline-mode-toggle {
  margin-left: 16px !important;
  margin-right: 16px !important;
}

.stock-chart:fullscreen .fullscreen-actions {
  display: flex !important;
}

.stock-chart:fullscreen .action-icon-btn {
  display: flex !important;
  width: 44px !important;
  height: 44px !important;
}

/* Floating Gear Button */
.gear-button {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(16, 12, 48, 0.95));
  color: rgba(100, 200, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: none;
  z-index: 100 !important;
  pointer-events: auto;
}

.gear-button:hover {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.15), rgba(100, 150, 255, 0.2));
  color: rgba(100, 200, 255, 1);
  transform: scale(1.08);
}

.gear-button.active {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.25), rgba(100, 150, 255, 0.3));
  color: #fff;
}

/* Removed spinning animation */

/* Floating Control Panel */
.floating-panel {
  position: fixed;
  top: 50%;
  right: 30px;
  transform: translateY(-50%);
  width: 320px;
  max-height: 75vh;
  overflow-y: auto;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(16, 12, 48, 0.98));
  backdrop-filter: blur(24px);
  border: 1px solid rgba(100, 200, 255, 0.25);
  border-radius: 20px;
  box-shadow: 
    0 20px 50px rgba(0, 0, 0, 0.6),
    0 0 80px rgba(100, 200, 255, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  z-index: 95;
  padding: 24px;
  animation: panelSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes panelSlideIn {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0) scale(1);
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(100, 200, 255, 0.15);
  position: relative;
}

.panel-header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg, rgba(100, 200, 255, 0.8), transparent);
  border-radius: 1px;
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: 0.02em;
}

.panel-title::before {
  content: '⚙️';
  font-size: 1.2rem;
}

.panel-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(100, 200, 255, 0.15);
  background: rgba(15, 23, 42, 0.8);
  color: rgba(226, 232, 240, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 0.9rem;
}

.panel-close:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
  transform: scale(1.1) rotate(90deg);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}

.panel-section {
  margin-bottom: 28px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(100, 200, 255, 0.08);
  transition: all 0.3s ease;
}

.panel-section:hover {
  background: rgba(15, 23, 42, 0.5);
  border-color: rgba(100, 200, 255, 0.15);
}

.panel-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  margin-bottom: 16px;
  padding: 8px 0;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.section-header:hover {
  background: rgba(100, 200, 255, 0.05);
}

.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(226, 232, 240, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  position: relative;
  margin-bottom: 0;
}

.section-label::after {
  content: '';
  width: 40px;
  height: 1px;
  background: linear-gradient(90deg, rgba(100, 200, 255, 0.3), transparent);
  margin-left: 8px;
}

.section-toggle {
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.6);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.section-toggle.rotated {
  transform: rotate(-90deg);
}

.section-toggle:hover {
  color: rgba(100, 200, 255, 0.8);
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
  gap: 8px;
  padding: 16px 12px;
  border: 1px solid rgba(100, 200, 255, 0.2);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.4);
  color: rgba(226, 232, 240, 0.7);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.toggle-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(100, 200, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.toggle-btn i {
  font-size: 1.2rem;
}

.toggle-btn span {
  font-size: 0.75rem;
  font-weight: 500;
}

.toggle-btn:hover {
  background: rgba(100, 200, 255, 0.12);
  border-color: rgba(100, 200, 255, 0.4);
  color: #fff;
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(100, 200, 255, 0.15);
}

.toggle-btn:hover::before {
  left: 100%;
}

.toggle-btn.active {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(147, 51, 234, 0.3));
  border-color: rgba(59, 130, 246, 0.6);
  color: #fff;
  box-shadow: 
    0 0 20px rgba(59, 130, 246, 0.4),
    0 4px 15px rgba(59, 130, 246, 0.2),
    inset 0 1px 3px rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
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

/* Indicator Toggles */
.indicator-toggles {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.indicator-toggle {
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid rgba(100, 200, 255, 0.2);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.indicator-toggle::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, rgba(100, 200, 255, 0.6), rgba(147, 51, 234, 0.6));
  transform: scaleY(0);
  transition: transform 0.3s ease;
}

.indicator-toggle:hover {
  background: rgba(100, 200, 255, 0.12);
  border-color: rgba(100, 200, 255, 0.4);
  transform: translateX(4px);
}

.indicator-toggle:hover::before {
  transform: scaleY(1);
}

.toggle-checkbox {
  width: 20px;
  height: 20px;
  margin-right: 16px;
  cursor: pointer;
  accent-color: rgba(59, 130, 246, 0.8);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.toggle-checkbox:checked {
  accent-color: rgba(59, 130, 246, 1);
  transform: scale(1.1);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(226, 232, 240, 0.8);
  font-size: 0.95rem;
  font-weight: 600;
  flex: 1;
  transition: all 0.3s ease;
}

.toggle-label i {
  color: rgba(100, 200, 255, 0.7);
  font-size: 1.1rem;
  transition: all 0.3s ease;
}

.indicator-toggle:has(.toggle-checkbox:checked) {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(147, 51, 234, 0.25));
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
}

.indicator-toggle:has(.toggle-checkbox:checked)::before {
  transform: scaleY(1);
}

.indicator-toggle:has(.toggle-checkbox:checked) .toggle-label {
  color: #fff;
  font-weight: 700;
}

.indicator-toggle:has(.toggle-checkbox:checked) .toggle-label i {
  color: rgba(59, 130, 246, 0.9);
  transform: scale(1.1);
}

/* Parameter Controls */
.parameter-controls {
  margin-top: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  border: 1px solid rgba(100, 200, 255, 0.15);
}

.param-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.param-group:last-child {
  margin-bottom: 0;
}

.param-group label {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.7);
  font-weight: 500;
  min-width: 40px;
}

.param-input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid rgba(100, 200, 255, 0.25);
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.8);
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.85rem;
  text-align: center;
  transition: all 0.2s ease;
}

.param-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  background: rgba(15, 23, 42, 0.9);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.2);
}

.param-input:hover {
  border-color: rgba(100, 200, 255, 0.4);
}

/* Parameter Warning */
.param-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 6px;
  color: rgba(251, 191, 36, 0.95);
  font-size: 0.8rem;
  line-height: 1.4;
}

.param-warning i {
  color: rgba(245, 158, 11, 0.9);
  font-size: 0.9rem;
  margin-top: 2px;
  flex-shrink: 0;
}

.param-warning span {
  flex: 1;
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

/* Collapse Animation */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 500px;
  opacity: 1;
  transform: translateY(0);
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

/* Fix sticky header z-index over chart - Ensure chart stays below header */
.chart-container {
  width: 100% !important;
  height: 640px !important;
  min-height: 640px !important;
  position: relative !important;
  z-index: 1 !important;
  overflow: visible !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  display: block !important;
  isolation: isolate !important;
  visibility: visible !important;
}

/* 確保 ECharts canvas 在工具列下方 */
.chart-container canvas {
  position: relative !important;
  z-index: 1 !important;
}

/* Fix sticky header z-index over chart */
.chart-wrapper {
  position: relative;
  z-index: 1;
  isolation: isolate;
  /* Remove any outer frame/glow */
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.chart-info {
  display: flex;
  justify-content: center;
  background: rgba(15, 23, 42, 0.4);
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
