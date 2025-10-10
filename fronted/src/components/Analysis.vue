<script setup>
import { onMounted, onBeforeUnmount, reactive, watch, computed, ref, nextTick } from 'vue'
import Chart from 'chart.js/auto'
import { fetchRankings } from '../services/api'
import '../assets/analysis-themes.css'

const panel = reactive({
  period: 'daily',
  market: 'all',
})

const state = reactive({
  factor: 'return',
  buckets: 10,
  metric: 'avg', // avg | ir
  strategyType: 'momentum',
  riskTolerance: 'moderate',
  investAmount: 1_000_000,
  maxStocks: 10,
  maxWeight: 20,
  signals: [],
  portfolio: [],
  riskBars: { market: 0, concentration: 0, liquidity: 0 },
})

const loading = ref(false)
const analysisRows = ref([])
let chart
let resizeFrame = null

const periodOptions = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '週' },
  { value: 'monthly', label: '月' },
  { value: 'quarterly', label: '季' },
  { value: 'yearly', label: '年' },
]

async function loadAnalysisData() {
  loading.value = true
  try {
    const list = await fetchRankings({
      period: panel.period,
      market: panel.market,
      limit: 200,
    })
    analysisRows.value = (list || []).map((item, idx) => ({
      rank: idx + 1,
      symbol: item.symbol,
      name: item.name || item.symbol,
      short_name: item.short_name || item.name || '',
      return: parseFloat(item.return_rate) || 0,
      price: parseFloat(item.current_price) || 0,
      change: parseFloat(item.price_change) || 0,
      volume: parseInt(item.volume) || 0,
      cumulative: parseFloat(item.cumulative_return) || 0,
      market: item.market || 'all',
      industry: item.industry || 'all',
      volatility: parseFloat(item.volatility) || 0.5,
    }))
    await nextTick()
    renderChart()
    assessRisk()
  } catch (e) {
    analysisRows.value = []
    console.warn('analysis load error', e)
  } finally {
    loading.value = false
  }
}

function buildGroups(data, factorKey, bucketCount){
  const getVal = (d) => (factorKey === 'return' ? Number(d.return) : Number(d[factorKey]))
  const rows = (data || []).filter(d => Number.isFinite(Number(d.return)) && Number.isFinite(getVal(d)))
  if (!rows.length) return []
  const sorted = [...rows].sort((a,b)=> getVal(a) - getVal(b))
  const n = sorted.length
  const base = Math.floor(n / bucketCount)
  const groups = []
  for (let i=0, start=0; i<bucketCount; i++){
    let size = (i < bucketCount - 1) ? base : (n - start)
    if (size <= 0) size = 0
    const g = sorted.slice(start, start + size)
    start += size
    const returns = g.map(x => Number(x.return)).filter(Number.isFinite)
    const mean = returns.reduce((s,r)=> s + r, 0) / Math.max(1, returns.length)
    const variance = returns.length > 1 ? returns.reduce((s,v)=> s + Math.pow(v - mean, 2), 0) / (returns.length - 1) : 0
    const stdev = Math.sqrt(variance)
    const ir = stdev > 0 ? (mean / stdev) : 0
    groups.push({ label: `Q${i+1}`, count: g.length, mean, ir })
  }
  return groups
}

function renderChart(){
  const wrap = document.getElementById('quantBarWrap')
  const canvasEl = document.getElementById('quantBarCanvas')
  const ctx = canvasEl?.getContext('2d')
  if (!ctx || !wrap || !canvasEl) return
  const groups = buildGroups(analysisRows.value, state.factor, Number(state.buckets))
  if (chart) { chart.destroy(); chart = null }
  if (!groups.length){
    wrap.classList.add('empty')
    return
  }
  wrap.classList.remove('empty')
  const wrapWidth = wrap.offsetWidth || 0
  const axisFontSize = wrapWidth < 420 ? 10 : wrapWidth < 640 ? 12 : 14
  const valueFontSize = wrapWidth < 480 ? 11 : wrapWidth < 780 ? 12 : 13
  const labelRotation = wrapWidth < 560 ? 35 : wrapWidth < 720 ? 20 : 0
  const maxTicks = wrapWidth < 420 ? 5 : wrapWidth < 640 ? 8 : 10
  const maxBarThickness = wrapWidth < 420 ? 26 : wrapWidth < 640 ? 34 : 42
  const borderRadius = wrapWidth < 420 ? 8 : wrapWidth < 640 ? 10 : 12
  const chartHeight = wrapWidth < 420 ? 230 : wrapWidth < 768 ? 270 : 320
  canvasEl.height = chartHeight
  canvasEl.style.height = `${chartHeight}px`
  wrap.style.setProperty('--chart-height', `${chartHeight}px`)
  const metricKey = state.metric === 'ir' ? 'ir' : 'mean'
  const labels = groups.map(g => `${g.label} (n=${g.count})`)
  const values = groups.map(g => Number.isFinite(g[metricKey]) ? g[metricKey] : 0)

  const posGrad = ctx.createLinearGradient(0, 0, 0, chartHeight)
  posGrad.addColorStop(0, 'rgba(0, 212, 255, 0.95)')
  posGrad.addColorStop(1, 'rgba(0, 160, 255, 0.45)')
  const negGrad = ctx.createLinearGradient(0, 0, 0, chartHeight)
  negGrad.addColorStop(0, 'rgba(255, 120, 160, 0.9)')
  negGrad.addColorStop(1, 'rgba(255, 80, 120, 0.55)')
  const neutralColor = 'rgba(0, 212, 255, 0.85)'
  const colors = metricKey === 'ir'
    ? values.map(() => neutralColor)
    : values.map(v => v >= 0 ? posGrad : negGrad)
  const borderColors = metricKey === 'ir'
    ? values.map(() => 'rgba(0, 212, 255, 1)')
    : values.map(v => v >= 0 ? 'rgba(0, 255, 200, 1)' : 'rgba(255, 120, 160, 1)')
  const ymax = Math.max(2, Math.max(...values.map(v => Math.abs(v))) * 1.2)
  const yMin = metricKey === 'ir' ? 0 : -Math.max(1, ymax * 0.4)

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: metricKey === 'ir' ? 'IR' : '平均報酬 (%)',
        data: values,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1.2,
        borderRadius,
        barThickness: 'flex',
        maxBarThickness,
        hoverBackgroundColor: colors,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: wrapWidth < 560 ? 8 : 12,
          right: 12,
          bottom: wrapWidth < 560 ? 12 : 18,
          left: 10,
        },
      },
      plugins: { legend: { display: false } },
      animation: { duration: 650, easing: 'easeOutQuart' },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: { size: axisFontSize, family: '"Noto Sans TC", sans-serif' },
            maxRotation: labelRotation,
            minRotation: labelRotation,
            autoSkip: true,
            maxTicksLimit: maxTicks,
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
        y: {
          title: {
            display: true,
            text: metricKey === 'ir' ? 'Information Ratio' : 'Return (%)',
            color: '#9ca3af',
            font: { size: valueFontSize },
          },
          ticks: {
            color: '#e5e7eb',
            font: { size: valueFontSize },
            padding: 6,
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
          suggestedMax: ymax,
          suggestedMin: yMin,
        }
      }
    }
  })
}

function handleResize(){
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    renderChart()
  })
}

function percentile(arr, p){
  if (!Array.isArray(arr) || !arr.length) return 0
  const a = [...arr].sort((x,y)=> x - y)
  const idx = Math.min(a.length - 1, Math.floor(a.length * p))
  return a[idx]
}

function buildAnomalies(data){
  const rows = (data || []).filter(d => Number.isFinite(Number(d.return)))
  if (!rows.length) return []
  const vols = rows.map(r => Number(r.volume)).filter(v => Number.isFinite(v))
  const vol90 = vols.length ? percentile(vols, 0.9) : Infinity
  const enriched = rows
    .map(row => {
      const ret = Number(row.return)
      const vol = Number(row.volume) || 0
      let type = 'neutral'
      if (ret >= 9) type = 'surge'
      else if (ret <= -6) type = 'drop'
      else if (vol >= vol90) type = 'volume'
      return {
        symbol: row.symbol,
        name: row.short_name || row.name || '',
        return: ret,
        volume: vol,
        type,
      }
    })
    .filter(item => item.type !== 'neutral')
    .sort((a,b) => Math.abs(b.return) - Math.abs(a.return))
    .slice(0, 20)
  return enriched
}

const anomalies = computed(() => buildAnomalies(analysisRows.value))

const currentPeriodLabel = computed(() => {
  const found = periodOptions.find(opt => opt.value === panel.period)
  return found ? found.label : '日'
})

const portfolioMetrics = computed(() => {
  if (!state.portfolio.length) return { expected: 0, count: 0, allocation: state.investAmount }
  const expected = state.portfolio.reduce((sum, item) => sum + (item.expectedReturn * (item.weight / 100)), 0)
  return {
    expected,
    count: state.portfolio.length,
    allocation: state.portfolio.reduce((sum, item) => sum + item.amount, 0),
  }
})

function formatPercent(value, digits = 2){
  if (!Number.isFinite(Number(value))) return '--'
  const sign = Number(value) > 0 ? '+' : ''
  return `${sign}${Number(value).toFixed(digits)}%`
}

function formatNumber(value){
  if (!Number.isFinite(Number(value))) return '--'
  if (Math.abs(value) >= 1_000_000_000) return `${(value/1_000_000_000).toFixed(2)}B`
  if (Math.abs(value) >= 1_000_000) return `${(value/1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `${(value/1_000).toFixed(2)}K`
  return Number(value).toLocaleString()
}

function formatCurrency(value){
  if (!Number.isFinite(Number(value))) return '--'
  if (Math.abs(value) >= 1_000_000) return `${(value/1_000_000).toFixed(2)} 百萬`
  if (Math.abs(value) >= 1_000) return `${(value/1_000).toFixed(1)} 千`
  return Number(value).toLocaleString()
}

function anomalyLabel(type){
  return {
    surge: '急漲',
    drop: '急跌',
    volume: '爆量',
  }[type] || '異常'
}

function anomalyClass(type){
  return {
    surge: 'anomaly-tag--up',
    drop: 'anomaly-tag--down',
    volume: 'anomaly-tag--vol',
  }[type] || 'anomaly-tag--neutral'
}

function riskLevelClass(value){
  if (value < 30) return 'risk-bar--low'
  if (value < 70) return 'risk-bar--mid'
  return 'risk-bar--high'
}

watch([analysisRows, () => state.factor, () => state.buckets, () => state.metric], () => {
  requestAnimationFrame(() => {
    renderChart()
  })
})
watch(() => [panel.period, panel.market], () => {
  loadAnalysisData()
}, { immediate: true })
onMounted(() => {
  window.addEventListener('resize', handleResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  if (chart) { chart.destroy(); chart = null }
})

function generateSignals(){
  const data = Array.isArray(analysisRows.value) ? analysisRows.value : []
  if (!data.length) { state.signals = []; return }
  const thresholds = {
    conservative: { buy: 3, sell: -2, volume: 0.8 },
    moderate: { buy: 2, sell: -3, volume: 1.2 },
    aggressive: { buy: 1, sell: -4, volume: 1.5 }
  }[state.riskTolerance]
  const signals = []
  for (const stock of data){
    let signal = 'hold'
    let strength = 0
    let reason = ''
    const ret = Number(stock.return) || 0
    const vol = Number(stock.volume) || 0
    if (state.strategyType === 'momentum'){
      if (ret > thresholds.buy){ signal = 'buy'; strength = Math.min(100, (ret / thresholds.buy) * 32); reason = `動量突破 ${ret.toFixed(2)}%` }
      else if (ret < thresholds.sell){ signal = 'sell'; strength = Math.min(100, Math.abs(ret / thresholds.sell) * 32); reason = `動量下跌 ${ret.toFixed(2)}%` }
    } else if (state.strategyType === 'reversal'){
      if (ret < -6){ signal = 'buy'; strength = Math.min(100, Math.abs(ret) * 4); reason = `超跌反彈 ${ret.toFixed(2)}%` }
      else if (ret > 8){ signal = 'sell'; strength = Math.min(100, ret * 4); reason = `漲幅過大 ${ret.toFixed(2)}%` }
    } else if (state.strategyType === 'volume'){
      const avgVol = data.reduce((sum, row) => sum + (Number(row.volume) || 0), 0) / Math.max(1, data.length)
      if (vol > avgVol * thresholds.volume && ret > 1){ signal = 'buy'; strength = Math.min(100, (vol / Math.max(1, avgVol)) * 18); reason = `放量上漲 ${formatNumber(vol)}` }
    } else if (state.strategyType === 'composite'){
      let score = 0
      if (ret > 2) score += 30
      if (ret < -3) score -= 25
      const avgVol = data.reduce((sum, row) => sum + (Number(row.volume) || 0), 0) / Math.max(1, data.length)
      if (vol > avgVol * 1.4) score += 20
      if ((Number(stock.volatility) || 0) < 0.45) score += 10
      if (score > 35){ signal = 'buy'; strength = Math.min(100, score); reason = `綜合評分 ${score.toFixed(0)}` }
      else if (score < -20){ signal = 'sell'; strength = Math.min(100, Math.abs(score)); reason = `綜合評分 ${score.toFixed(0)}` }
    }
    if (signal !== 'hold'){
      signals.push({
        symbol: stock.symbol,
        name: stock.short_name || stock.name || '',
        signal,
        strength,
        reason,
      })
    }
  }
  state.signals = signals.sort((a,b) => b.strength - a.strength).slice(0, 8)
}

function optimizePortfolio(){
  const data = Array.isArray(analysisRows.value) ? analysisRows.value : []
  if (!data.length || !Number.isFinite(Number(state.investAmount))) { state.portfolio = []; return }
  const candidates = data
    .filter(s => (Number(s.volume) || 0) > 800_000)
    .map(s => ({
      ...s,
      score: (Number(s.return) || 0) / Math.max(0.2, Number(s.volatility) || 0.2),
    }))
    .sort((a,b) => b.score - a.score)
    .slice(0, Math.max(1, Number(state.maxStocks) || 10))
  const totalScore = candidates.reduce((sum, item) => sum + Math.max(0, item.score), 0)
  let portfolio = candidates.map(stock => {
    const weight = totalScore > 0
      ? Math.min(Number(state.maxWeight) || 20, Math.max(5, (Math.max(0, stock.score) / totalScore) * 100))
      : (100 / Math.max(1, candidates.length))
    const amount = Number(state.investAmount || 0) * (weight / 100)
    return {
      symbol: stock.symbol,
      name: stock.short_name || stock.name || '',
      weight,
      amount,
      expectedReturn: Number(stock.return) || 0,
    }
  })
  const totalWeight = portfolio.reduce((sum, item) => sum + item.weight, 0)
  portfolio = portfolio.map(item => {
    const adjustedWeight = totalWeight > 0 ? (item.weight / totalWeight) * 100 : item.weight
    const adjustedAmount = Number(state.investAmount || 0) * (adjustedWeight / 100)
    return { ...item, weight: adjustedWeight, amount: adjustedAmount }
  })
  state.portfolio = portfolio
}

function assessRisk(){
  const data = Array.isArray(analysisRows.value) ? analysisRows.value : []
  if (!data.length){
    state.riskBars = { market: 0, concentration: 0, liquidity: 0 }
    return
  }
  const returns = data.map(item => Number(item.return) || 0)
  const avgReturn = returns.reduce((sum, val) => sum + val, 0) / Math.max(1, returns.length)
  const marketRisk = Math.min(100, Math.abs(avgReturn) * 6)
  const concentrationRisk = Math.min(100, (data.filter(item => (Number(item.volume) || 0) < 3_000_000).length / data.length) * 100)
  const liquidityRisk = Math.min(100, (data.filter(item => (Number(item.volume) || 0) < 1_000_000).length / data.length) * 100)
  state.riskBars = {
    market: marketRisk,
    concentration: concentrationRisk,
    liquidity: liquidityRisk,
  }
}

function fmtPct(value, digits = 1){
  if (!Number.isFinite(Number(value))) return '--'
  return `${Number(value).toFixed(digits)}%`
}

</script>

<template>
  <section class="analysis-section">
    <div class="analysis-header">
      <div class="analysis-header-panel theme-1">
        <div class="analysis-title">
          <div class="analysis-title__left">
            <i class="fas fa-chart-line"></i>
            <div>
              <span class="analysis-title__main">深度分析</span>
              <span class="analysis-title__sub">依照因子分組觀察市場結構</span>
            </div>
          </div>
          <span class="analysis-period-badge">當前週期：{{ currentPeriodLabel }}</span>
        </div>
        <div class="analysis-toolbar">
          <span class="toolbar-title"><i class="fas fa-sliders-h"></i> 分析條件</span>
          <div class="analysis-filters">
            <div class="analysis-filter period-filter">
              <label>週期</label>
              <div class="period-buttons">
                <button
                  v-for="item in periodOptions"
                  :key="item.value"
                  type="button"
                  class="period-chip"
                  :class="{ active: panel.period === item.value }"
                  @click="panel.period = item.value"
                >{{ item.label }}</button>
              </div>
            </div>
            <div class="analysis-filter">
              <label>市場別</label>
              <select
                class="filter-input"
                v-model="panel.market"
              >
                <option value="all">全部市場</option>
                <option value="listed">上市</option>
                <option value="otc">上櫃</option>
              </select>
            </div>
            <div class="analysis-filter">
              <label>因子</label>
              <select v-model="state.factor" class="filter-input">
                <option value="return">報酬</option>
                <option value="volume">成交量</option>
                <option value="volatility">波動</option>
              </select>
            </div>
            <div class="analysis-filter">
              <label>組數</label>
              <select v-model.number="state.buckets" class="filter-input">
                <option :value="10">10 (Decile)</option>
                <option :value="5">5 (Quintile)</option>
              </select>
            </div>
            <div class="analysis-filter">
              <label>度量</label>
              <select v-model="state.metric" class="filter-input">
                <option value="avg">平均報酬</option>
                <option value="ir">IR</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="analysis-layout">
      <div class="analysis-card chart-card">
        <transition name="fade">
          <div v-if="loading" class="analysis-loading">
            <div class="spinner"></div>
            <span>載入中…</span>
          </div>
        </transition>
        <div class="card-header">
          <div class="card-title">
            <i class="fas fa-signal"></i>
            量化分組柱狀圖
          </div>
          <div class="card-subtitle">掌握不同分組的報酬輪動</div>
        </div>
        <div id="quantBarWrap" class="chart-wrapper">
          <canvas id="quantBarCanvas" height="320"></canvas>
        </div>
      </div>

      <div class="analysis-card anomaly-card">
        <div class="card-header">
          <div class="card-title">
            <i class="fas fa-exclamation-triangle"></i>
            市場異常
          </div>
          <div class="card-subtitle">依報酬與量能挑選的關鍵個股</div>
        </div>
        <div class="anomaly-list" v-if="anomalies.length">
          <div
            v-for="item in anomalies"
            :key="item.symbol + item.type"
            class="anomaly-item"
          >
            <div class="anomaly-item__left">
              <span class="anomaly-tag" :class="anomalyClass(item.type)">{{ anomalyLabel(item.type) }}</span>
              <div class="anomaly-symbol">
                <strong>{{ item.symbol }}</strong>
                <span class="anomaly-name" v-if="item.name">{{ item.name }}</span>
              </div>
            </div>
            <div class="anomaly-item__right">
              <span class="anomaly-return" :class="{ positive: item.return >= 0, negative: item.return < 0 }">{{ formatPercent(item.return) }}</span>
              <span class="anomaly-volume" v-if="item.volume">量 {{ formatNumber(item.volume) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="analysis-empty">目前沒有符合條件的異常個股</div>
      </div>

      <div class="analysis-card decision-card">
        <div class="decision-grid">
          <section class="decision-panel">
            <header class="decision-panel__header">
              <div class="decision-panel__title">
                <i class="fas fa-broadcast-tower"></i>
                買賣訊號
              </div>
              <span class="decision-panel__caption">選擇策略參數後產生提示</span>
            </header>
            <div class="decision-panel__body">
              <div class="form-grid">
                <label class="form-field">
                  <span>策略類型</span>
                  <select v-model="state.strategyType" class="filter-input">
                    <option value="momentum">動量策略</option>
                    <option value="reversal">反轉策略</option>
                    <option value="volume">成交量突破</option>
                    <option value="composite">綜合訊號</option>
                  </select>
                </label>
                <label class="form-field">
                  <span>風險傾向</span>
                  <select v-model="state.riskTolerance" class="filter-input">
                    <option value="conservative">保守型</option>
                    <option value="moderate">穩健型</option>
                    <option value="aggressive">積極型</option>
                  </select>
                </label>
              </div>
              <button class="decision-button" @click="generateSignals">
                <span>生成訊號</span>
                <i class="fas fa-magic"></i>
              </button>
              <div class="signal-board">
                <template v-if="state.signals.length">
                  <div v-for="signal in state.signals" :key="signal.symbol + signal.signal" class="signal-card" :class="signal.signal">
                    <div class="signal-card__symbol">
                      <strong>{{ signal.symbol }}</strong>
                      <span v-if="signal.name">{{ signal.name }}</span>
                    </div>
                    <div class="signal-card__meta">
                      <span class="signal-tag" :class="signal.signal==='buy' ? 'signal-tag--buy' : 'signal-tag--sell'">{{ signal.signal==='buy' ? '買進' : '賣出' }}</span>
                      <span class="signal-strength">{{ Math.round(signal.strength) }}%</span>
                    </div>
                    <div class="signal-card__reason">{{ signal.reason }}</div>
                  </div>
                </template>
                <div v-else class="signal-empty">請設定參數並生成訊號</div>
              </div>
            </div>
          </section>

          <section class="decision-panel">
            <header class="decision-panel__header">
              <div class="decision-panel__title">
                <i class="fas fa-chart-pie"></i>
                投資組合建議
              </div>
              <span class="decision-panel__caption">設定投入金額與限制</span>
            </header>
            <div class="decision-panel__body">
              <div class="form-grid">
                <label class="form-field">
                  <span>投資金額</span>
                  <input type="number" v-model.number="state.investAmount" class="filter-input" min="100000" step="100000">
                </label>
                <label class="form-field">
                  <span>最大持股數</span>
                  <input type="number" v-model.number="state.maxStocks" class="filter-input" min="3" max="20">
                </label>
                <label class="form-field">
                  <span>單股上限 (%)</span>
                  <input type="number" v-model.number="state.maxWeight" class="filter-input" min="5" max="40">
                </label>
              </div>
              <button class="decision-button" @click="optimizePortfolio">
                <span>優化組合</span>
                <i class="fas fa-sliders-h"></i>
              </button>
              <div class="portfolio-board">
                <div class="portfolio-summary">
                  <div class="summary-item">
                    <span>預期報酬</span>
                    <strong>{{ fmtPct(portfolioMetrics.expected, 1) }}</strong>
                  </div>
                  <div class="summary-item">
                    <span>持股數量</span>
                    <strong>{{ portfolioMetrics.count }}</strong>
                  </div>
                  <div class="summary-item">
                    <span>資金配置</span>
                    <strong>{{ formatCurrency(portfolioMetrics.allocation) }}</strong>
                  </div>
                </div>
                <div class="portfolio-list" v-if="state.portfolio.length">
                  <div v-for="stock in state.portfolio" :key="stock.symbol" class="portfolio-item">
                    <div class="portfolio-item__symbol">
                      <strong>{{ stock.symbol }}</strong>
                      <span v-if="stock.name">{{ stock.name }}</span>
                    </div>
                    <div class="portfolio-item__meta">
                      <span class="meta-chip">{{ stock.weight.toFixed(1) }}%</span>
                      <span class="meta-chip">{{ formatCurrency(stock.amount) }}</span>
                    </div>
                    <span class="portfolio-return" :class="{ positive: stock.expectedReturn >= 0, negative: stock.expectedReturn < 0 }">{{ fmtPct(stock.expectedReturn, 1) }}</span>
                  </div>
                </div>
                <div v-else class="portfolio-empty">設定參數後點擊優化組合</div>
              </div>
            </div>
          </section>

          <section class="decision-panel">
            <header class="decision-panel__header">
              <div class="decision-panel__title">
                <i class="fas fa-heartbeat"></i>
                風險評估
              </div>
              <span class="decision-panel__caption">量化市場、集中與流動風險</span>
            </header>
            <div class="decision-panel__body">
              <ul class="risk-list">
                <li class="risk-item">
                  <span>市場風險</span>
                  <div class="risk-bar" :class="riskLevelClass(state.riskBars.market)">
                    <div class="risk-bar__fill" :style="{ width: state.riskBars.market + '%' }"></div>
                  </div>
                  <strong>{{ fmtPct(state.riskBars.market, 1) }}</strong>
                </li>
                <li class="risk-item">
                  <span>集中度風險</span>
                  <div class="risk-bar" :class="riskLevelClass(state.riskBars.concentration)">
                    <div class="risk-bar__fill" :style="{ width: state.riskBars.concentration + '%' }"></div>
                  </div>
                  <strong>{{ fmtPct(state.riskBars.concentration, 1) }}</strong>
                </li>
                <li class="risk-item">
                  <span>流動性風險</span>
                  <div class="risk-bar" :class="riskLevelClass(state.riskBars.liquidity)">
                    <div class="risk-bar__fill" :style="{ width: state.riskBars.liquidity + '%' }"></div>
                  </div>
                  <strong>{{ fmtPct(state.riskBars.liquidity, 1) }}</strong>
                </li>
              </ul>
              <button class="decision-button" @click="assessRisk">
                <span>評估風險</span>
                <i class="fas fa-search"></i>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>
