import { ref, reactive } from 'vue'
import { fetchRankings, fetchStatistics } from '../services/api'

export function useMarketData() {
  const period = ref('daily')
  const selectedDate = ref('')
  const filters = reactive({
    market: 'all',
    industry: 'all',
    returnRange: 'all',
    volumeThreshold: 0,
  })
  const currentData = ref([])
  const stats = ref(null)
  const asOf = ref(null)
  const apiStatus = reactive({ state: 'idle', text: '等待載入' })

  async function load() {
    apiStatus.state = 'loading'
    apiStatus.text = '載入中…'
    const [list, statResp] = await Promise.all([
      fetchRankings({ period: period.value, market: filters.market, industry: filters.industry, returnRange: filters.returnRange, volumeThreshold: filters.volumeThreshold, date: selectedDate.value, limit: 200 }),
      fetchStatistics({ period: period.value, market: filters.market, date: selectedDate.value })
    ])
    currentData.value = (list || []).map((item, idx) => ({
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
    if (statResp && statResp.data) {
      stats.value = statResp.data
      asOf.value = statResp.asOfDate || null
      apiStatus.state = 'connected'
      apiStatus.text = '已連線'
    } else {
      stats.value = null
      asOf.value = null
      apiStatus.state = 'error'
      apiStatus.text = '連線失敗'
    }
  }

  return { period, selectedDate, filters, currentData, stats, asOf, apiStatus, load }
}
