<script setup>
import { onMounted, onBeforeUnmount, reactive, computed, ref, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto'
import { fetchComparison } from '../services/api'

const props = defineProps({
  rows: { type: Array, default: () => [] }, // fallback dataset from rankings
  period: { type: [String, Object], default: 'daily' },
  date: { type: [String, Object], default: '' },
  market: { type: [String, Object], default: 'all' },
})

const state = reactive({
  input: '',
  selected: [],
})

const chartCanvas = ref(null)
let chartInstance = null
let resizeFrame = null
let activeFetchId = 0

const compareState = reactive({
  loading: false,
  rows: [],
  asOf: null,
  error: null,
  usedFallback: false,
})

const STORAGE_KEY = 'quantgems.comparisonSymbols'

function loadSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const items = Array.isArray(saved) ? saved.slice(0, 5) : []
    state.selected.splice(0, state.selected.length, ...items)
  } catch {
    state.selected.splice(0)
  }
}

function saveSelection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.selected.slice(0, 5)))
}

function addSymbol() {
  const sym = String(state.input || '').trim().toUpperCase()
  if (!sym) return
  if (state.selected.includes(sym)) return
  if (state.selected.length >= 5) return
  state.selected.push(sym)
  state.input = ''
  saveSelection()
}

function removeSymbol(sym) {
  const idx = state.selected.indexOf(sym)
  if (idx >= 0) {
    state.selected.splice(idx, 1)
    saveSelection()
  }
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\.(TW|TWO)$/i, '')
}

// Rankings fallback is disabled by request. We rely solely on backend DB API.

const tableRows = computed(() => compareState.rows)

const availableRows = computed(() =>
  tableRows.value.filter(row => row && !row.missing && Number.isFinite(Number(row.returnRate)))
)

// No fallback path

const comparisonMetrics = computed(() => {
  const rows = tableRows.value.filter(row => row && !row.missing)
  if (!rows.length) {
    return {
      count: 0,
      avgReturn: null,
      avgVolume: null,
      totalVolume: null,
      avgVolatility: null,
      best: null,
      worst: null,
      marketSummary: [],
    }
  }

  const returns = rows.map(row => Number(row.returnRate)).filter(Number.isFinite)
  const volumes = rows.map(row => Number(row.volume)).filter(Number.isFinite)
  const volatilities = rows.map(row => Number(row.volatility)).filter(Number.isFinite)

  const avgReturn = returns.length ? returns.reduce((sum, val) => sum + val, 0) / returns.length : null
  const totalVolume = volumes.length ? volumes.reduce((sum, val) => sum + val, 0) : null
  const avgVolume = volumes.length && totalVolume !== null ? totalVolume / volumes.length : null
  const avgVolatility = volatilities.length ? volatilities.reduce((sum, val) => sum + val, 0) / volatilities.length : null

  const validReturnRows = rows.filter(row => Number.isFinite(Number(row.returnRate)))
  const best = validReturnRows.length
    ? validReturnRows.reduce((prev, curr) => (Number(curr.returnRate) > Number(prev.returnRate) ? curr : prev))
    : null
  const worst = validReturnRows.length
    ? validReturnRows.reduce((prev, curr) => (Number(curr.returnRate) < Number(prev.returnRate) ? curr : prev))
    : null

  const marketCounts = rows.reduce((acc, row) => {
    const key = String(row.market || 'other').toLowerCase()
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const marketSummary = Object.entries(marketCounts)
    .map(([market, count]) => ({ market, count, label: marketLabel(market) }))
    .sort((a, b) => b.count - a.count)

  return {
    count: rows.length,
    avgReturn,
    avgVolume,
    totalVolume,
    avgVolatility,
    best,
    worst,
    marketSummary,
  }
})

const hasChartData = computed(() => !compareState.loading && availableRows.value.length > 0)

const allRowsMissing = computed(() => tableRows.value.length > 0 && tableRows.value.every(row => row.missing))

function formatPercent(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return '--'
  const num = Number(value)
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(digits)}%`
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return '--'
  const num = Number(value)
  const abs = Math.abs(num)
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toLocaleString()
}

function formatDecimal(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return '--'
  return Number(value).toFixed(digits)
}

function formatVolatility(value) {
  if (!Number.isFinite(Number(value))) return '--'
  const percent = Number(value) * 100
  return `${percent.toFixed(2)}%`
}

function marketLabel(code) {
  const key = String(code || '').toLowerCase()
  if (!key || key === 'all') return '全部'
  if (key === 'listed' || key === 'twse') return '上市'
  if (key === 'otc' || key === 'tpex') return '上櫃'
  return '其他'
}

function valueClass(value) {
  if (!Number.isFinite(Number(value))) return ''
  const num = Number(value)
  if (num > 0) return 'positive'
  if (num < 0) return 'negative'
  return ''
}

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
}

function renderChart() {
  const ctx = chartCanvas.value?.getContext('2d')
  if (!ctx) {
    destroyChart()
    return
  }
  const rows = availableRows.value
  if (!rows.length) {
    destroyChart()
    return
  }
  destroyChart()
  const labels = rows.map(row => row.symbol)
  const data = rows.map(row => Number(row.returnRate) || 0)
  
  // Create gradient backgrounds for bars
  const backgrounds = data.map(val => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400)
    if (val >= 0) {
      gradient.addColorStop(0, 'rgba(0, 212, 255, 0.8)')  // Cyan top
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.4)') // Green bottom
    } else {
      gradient.addColorStop(0, 'rgba(236, 72, 153, 0.8)') // Pink top
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.4)')  // Red bottom
    }
    return gradient
  })

  // Create glow border colors
  const borders = data.map(val => 
    val >= 0 ? 'rgba(0, 212, 255, 1)' : 'rgba(236, 72, 153, 1)'
  )

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '報酬率 (%)',
          data,
          backgroundColor: backgrounds,
          borderColor: borders,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          // Add shadow effect
          shadowOffsetX: 0,
          shadowOffsetY: 4,
          shadowBlur: 12,
          shadowColor: data.map(val => 
            val >= 0 ? 'rgba(0, 212, 255, 0.5)' : 'rgba(236, 72, 153, 0.5)'
          ),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart',
        onProgress: function(animation) {
          // Add glow effect during animation
          const progress = animation.currentStep / animation.numSteps
          ctx.shadowBlur = 15 * progress
        },
        onComplete: function() {
          ctx.shadowBlur = 15
        }
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#00d4ff',
          titleFont: {
            size: 14,
            weight: 'bold',
          },
          bodyColor: '#e2e8f0',
          bodyFont: {
            size: 13,
          },
          padding: 12,
          borderColor: 'rgba(0, 212, 255, 0.5)',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title(context) {
              const row = rows[context[0].dataIndex]
              return `${row.symbol} ${row.short_name || row.name || ''}`
            },
            label(context) {
              return `報酬率：${formatPercent(context.parsed.y, 2)}`
            },
            afterLabel(context) {
              const row = rows[context.dataIndex]
              const lines = []
              if (row.price) lines.push(`股價：NT$${formatDecimal(row.price, 2)}`)
              if (row.volume) lines.push(`成交量：${formatNumber(row.volume)}`)
              return lines.join('\n')
            }
          },
        },
      },
      scales: {
        x: {
          ticks: { 
            color: 'rgba(226, 232, 240, 0.8)',
            font: {
              size: 12,
              weight: '600',
            },
            padding: 8,
          },
          grid: { 
            display: true,
            color: 'rgba(99, 179, 237, 0.08)',
            lineWidth: 1,
            drawBorder: false,
          },
          border: {
            display: false,
          },
        },
        y: {
          ticks: {
            color: 'rgba(226, 232, 240, 0.8)',
            font: {
              size: 12,
              weight: '600',
            },
            padding: 8,
            callback: value => {
              const sign = value > 0 ? '+' : ''
              return `${sign}${value}%`
            },
          },
          grid: { 
            display: true,
            color: function(context) {
              // Zero line gets special color
              if (context.tick.value === 0) {
                return 'rgba(99, 179, 237, 0.3)'
              }
              return 'rgba(99, 179, 237, 0.08)'
            },
            lineWidth: function(context) {
              return context.tick.value === 0 ? 2 : 1
            },
            drawBorder: false,
          },
          border: {
            display: false,
            dash: [5, 5],
          },
        },
      },
    },
  })
  
  // Add custom glow effect to bars
  const originalDraw = chartInstance.draw
  chartInstance.draw = function() {
    ctx.save()
    data.forEach((val, index) => {
      if (val !== 0) {
        ctx.shadowColor = val >= 0 ? 'rgba(0, 212, 255, 0.6)' : 'rgba(236, 72, 153, 0.6)'
        ctx.shadowBlur = 12
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
      }
    })
    originalDraw.call(this)
    ctx.restore()
  }
}

function handleResize() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    renderChart()
  })
}

async function loadComparison() {
  const displaySymbols = state.selected.slice(0, 5)
  activeFetchId += 1
  const fetchId = activeFetchId

  if (!displaySymbols.length) {
    compareState.rows = []
    compareState.asOf = null
    compareState.error = null
    compareState.loading = false
    nextTick(() => renderChart())
    return
  }

  compareState.loading = true
  compareState.error = null

  const normalizedSymbols = displaySymbols.map(normalizeSymbol).filter(Boolean)
  if (!normalizedSymbols.length) {
    compareState.rows = displaySymbols.map(symbol => ({
      symbol,
      name: null,
      short_name: null,
      market: null,
      price: null,
      prior_close: null,
      volume: null,
      returnRate: null,
      volatility: null,
      missing: true,
    }))
    compareState.loading = false
    compareState.asOf = null
    nextTick(() => renderChart())
    return
  }

  try {
    const { data, asOfDate } = await fetchComparison({
      symbols: normalizedSymbols,
      period: props.period,
      date: props.date,
      market: props.market,
    })
    if (fetchId !== activeFetchId) return
    const map = new Map()
    data.forEach(item => {
      const key = normalizeSymbol(item.symbol)
      if (!map.has(key) || !item.missing) {
        map.set(key, item)
      }
    })
    compareState.rows = displaySymbols.map(symbol => {
      const key = normalizeSymbol(symbol)
      const row = map.get(key)
      if (row && ([row.return, row.price, row.volume].some(val => val !== null && Number.isFinite(Number(val))))) {
        return {
          symbol,
          name: row.name || row.short_name || null,
          short_name: row.short_name || row.name || null,
          market: row.market || null,
          price: Number.isFinite(Number(row.price)) ? Number(row.price) : null,
          prior_close: Number.isFinite(Number(row.prior_close)) ? Number(row.prior_close) : null,
          volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : null,
          returnRate: Number.isFinite(Number(row.return)) ? Number(row.return) * 100 : null,
          volatility: Number.isFinite(Number(row.volatility)) ? Number(row.volatility) : null,
          missing: row.return === null && row.price === null,
        }
      }

      return {
        symbol,
        name: null,
        short_name: null,
        market: null,
        price: null,
        prior_close: null,
        volume: null,
        returnRate: null,
        volatility: null,
        missing: true,
      }
    })
    compareState.asOf = asOfDate || null
    compareState.error = null
    compareState.usedFallback = false
    compareState.loading = false
    nextTick(() => renderChart())
  } catch (error) {
    if (fetchId !== activeFetchId) return
    compareState.rows = []
    compareState.asOf = null
    compareState.error = error?.message || '讀取比較資料時發生問題'
    compareState.usedFallback = false
    compareState.loading = false
    nextTick(() => renderChart())
  }
}

watch(
  () => state.selected.slice(),
  () => {
    loadComparison()
  }
)

watch(
  () => [props.period, props.date, props.market],
  () => {
    if (state.selected.length) {
      loadComparison()
    }
  }
)

watch(
  () => compareState.loading,
  loading => {
    if (!loading) {
      nextTick(() => renderChart())
    }
  }
)

// Removed fallback watcher (DB only)

onMounted(() => {
  window.addEventListener('resize', handleResize)
  loadSelection()
  nextTick(() => {
    loadComparison()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  destroyChart()
})
</script>

<template>
  <section class="comparison-section" id="comparisonSection">
    <div class="comparison-grid">
      <div class="comparison-card comparison-settings" id="comparisonSettingsCard">
        <h3><i class="fas fa-balance-scale"></i> 比較設定</h3>
        <div class="comparison-controls">
          <div class="control-group">
            <input v-model="state.input" class="filter-input" placeholder="輸入代碼，例如 2330 或 2330.TW" @keyup.enter="addSymbol" />
            <button class="btn-primary" @click="addSymbol"><i class="fas fa-plus"></i> 加入</button>
          </div>
        </div>
        <div class="chip-list">
          <template v-if="state.selected.length">
            <span class="chip" v-for="sym in state.selected" :key="sym">
              <span class="stock-symbol">{{ sym }}</span>
              <span class="remove" @click="removeSymbol(sym)" :title="`移除 ${sym}`">✕</span>
            </span>
          </template>
          <div class="empty-state" v-else>
            <i class="fas fa-chart-line"></i>
            <div>尚未選擇股票</div>
          </div>
        </div>
      </div>
      <div class="comparison-card comparison-metrics" id="comparisonMetricsCard">
        <h3><i class="fas fa-chart-bar"></i> 指標總覽</h3>
        <div v-if="compareState.loading" class="alert alert--info">
          <i class="fas fa-circle-notch fa-spin"></i>
          正在載入比較資料...
        </div>
        <div v-else-if="compareState.error" class="alert alert--error">
          <i class="fas fa-circle-exclamation"></i>
          {{ compareState.error }}
        </div>
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">平均報酬</span>
            <strong class="metric-value" :class="valueClass(comparisonMetrics.avgReturn)">{{ formatPercent(comparisonMetrics.avgReturn) }}</strong>
            <span class="metric-sub">共 {{ comparisonMetrics.count }} 檔</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">總成交量</span>
            <strong class="metric-value">{{ formatNumber(comparisonMetrics.totalVolume) }}</strong>
            <span class="metric-sub">平均 {{ formatNumber(comparisonMetrics.avgVolume) }}/檔</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">平均波動</span>
            <strong class="metric-value">{{ formatVolatility(comparisonMetrics.avgVolatility) }}</strong>
            <span class="metric-sub">數值越小代表波動越低</span>
          </div>
          <div class="metric-card metric-card--pair">
            <span class="metric-label">最佳 / 最弱</span>
            <div class="metric-pair" v-if="comparisonMetrics.best">
              <div class="metric-pair__item">
                <strong class="metric-value positive">{{ comparisonMetrics.best.symbol }}</strong>
                <span class="metric-sub">{{ formatPercent(comparisonMetrics.best.returnRate) }}</span>
              </div>
              <div class="metric-pair__item" v-if="comparisonMetrics.worst">
                <strong class="metric-value negative">{{ comparisonMetrics.worst.symbol }}</strong>
                <span class="metric-sub">{{ formatPercent(comparisonMetrics.worst.returnRate) }}</span>
              </div>
            </div>
            <div v-else class="metric-empty">選擇股票後顯示績效</div>
          </div>
        </div>
        <div class="market-tags" v-if="comparisonMetrics.marketSummary.length">
          <div class="market-tag" v-for="item in comparisonMetrics.marketSummary" :key="item.market">
            <span>{{ item.label }}</span>
            <strong>{{ item.count }}</strong>
          </div>
        </div>
        <div v-else class="empty-state">
          <i class="fas fa-layer-group"></i>
          <div>選擇股票後顯示市場分布</div>
        </div>
      </div>
      <div class="comparison-card comparison-chart" id="comparisonChartCard">
        <h3><i class="fas fa-chart-line"></i> 報酬比較圖</h3>
        <div class="comparison-chart__wrapper">
          <canvas v-show="hasChartData" ref="chartCanvas"></canvas>
          <div class="empty-state" v-if="compareState.loading">
            <i class="fas fa-circle-notch fa-spin"></i>
            <div>圖表載入中...</div>
          </div>
          <div class="empty-state" v-else-if="!hasChartData">
            <i class="fas fa-chart-column"></i>
            <div>{{ compareState.usedFallback ? '已使用排行榜備援資料，但仍缺乏圖表數值' : '選擇股票後顯示報酬趨勢' }}</div>
          </div>
        </div>
      </div>
      <div class="comparison-card comparison-table-card" id="comparisonTableCard">
        <h3><i class="fas fa-table"></i> 數據比較</h3>
        <div class="comparison-table-wrapper" style="overflow-x:auto;">
          <table class="comparison-table">
            <thead>
              <tr>
                <th>股票</th>
                <th>名稱</th>
                <th>報酬率</th>
                <th>股價</th>
                <th>成交量</th>
                <th>波動</th>
                <th>市場</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!tableRows.length">
                <td colspan="7" class="empty-state"><i class="fas fa-table"></i><div>選擇股票查看數據表</div></td>
              </tr>
              <tr v-for="(s, idx) in tableRows" :key="s.symbol + '-' + idx">
                <td>
                  <div class="stock-cell">
                    <span class="stock-symbol">{{ s.symbol }}</span>
                    <span v-if="s.missing" class="stock-badge">暫無數據</span>
                  </div>
                </td>
                <td class="text-left">{{ s.short_name || s.name || '--' }}</td>
                <td :class="['numeric', valueClass(s.returnRate)]">{{ formatPercent(s.returnRate) }}</td>
                <td class="numeric">{{ formatDecimal(s.price, 2) }}</td>
                <td class="numeric">{{ formatNumber(s.volume) }}</td>
                <td class="numeric">{{ formatVolatility(s.volatility) }}</td>
                <td class="text-center">{{ marketLabel(s.market) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
