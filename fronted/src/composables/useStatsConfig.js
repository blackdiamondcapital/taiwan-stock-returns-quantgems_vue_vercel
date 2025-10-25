import { ref, watch } from 'vue'

// 預設卡片配置
const defaultCards = [
  { id: 'rising', label: '今日上漲股票數', group: 'market', visible: true, order: 1 },
  { id: 'falling', label: '今日下跌股票數', group: 'market', visible: true, order: 2 },
  { id: 'unchanged', label: '平盤股票數', group: 'market', visible: true, order: 3 },
  { id: 'limitUpDown', label: '漲停/跌停股票數', group: 'market', visible: true, order: 4 },
  { id: 'totalValue', label: '成交金額', group: 'market', visible: true, order: 5 },
  { id: 'topReturn', label: '本月最佳報酬', group: 'market', visible: true, order: 6 },
  { id: 'avgReturn', label: '市場平均報酬率', group: 'market', visible: true, order: 7 },
  { id: 'newHigh', label: '突破新高股票', group: 'market', visible: true, order: 8 },
  { id: 'ma5', label: '站上 MA5 比例', group: 'technical', visible: true, order: 9 },
  { id: 'ma10', label: '站上 MA10 比例', group: 'technical', visible: true, order: 10 },
  { id: 'ma20', label: '站上 MA20 比例', group: 'technical', visible: true, order: 11 },
  { id: 'ma60', label: '站上 MA60 比例', group: 'technical', visible: true, order: 12 },
  { id: 'ma120', label: '站上 MA120 比例', group: 'technical', visible: true, order: 13 },
  { id: 'ma240', label: '站上 MA240 比例', group: 'technical', visible: true, order: 14 },
  { id: 'goldenCross', label: '黃金交叉股票數', group: 'technical', visible: true, order: 15 },
  { id: 'deathCross', label: '死亡交叉股票數', group: 'technical', visible: true, order: 16 },
  { id: 'bullishAlignment', label: '多頭排列股票數', group: 'technical', visible: true, order: 17 },
  { id: 'bearishAlignment', label: '空頭排列股票數', group: 'technical', visible: true, order: 18 },
  { id: 'adRatio', label: '上漲/下跌 比', group: 'breadth', visible: true, order: 19 },
  { id: 'advanceDeclineLine', label: '騰落線（ADL）', group: 'breadth', visible: true, order: 20 },
  { id: 'newHighLow', label: '新高/新低股票數', group: 'breadth', visible: true, order: 21 },
  { id: 'gainDistribution', label: '上漲幅度分布', group: 'breadth', visible: true, order: 22 },
  { id: 'lossDistribution', label: '下跌幅度分布', group: 'breadth', visible: true, order: 23 },
  { id: 'marketParticipation', label: '市場參與度', group: 'breadth', visible: true, order: 24 },
  { id: 'hiVol', label: '高波動警示比例', group: 'risk', visible: true, order: 25 },
  { id: 'heavyLosers', label: '跌幅超過 5% 股票數', group: 'risk', visible: true, order: 26 },
  { id: 'severeDecliners', label: '跌幅超過 7% 股票數', group: 'risk', visible: true, order: 27 },
  { id: 'crashStocks', label: '跌幅超過 10% 股票數', group: 'risk', visible: true, order: 28 },
  { id: 'consecutiveDecliners', label: '連續下跌股票數', group: 'risk', visible: true, order: 29 },
  { id: 'breakdownStocks', label: '破底股票數', group: 'risk', visible: true, order: 30 },
  { id: 'volumeDryStocks', label: '成交量萎縮股票數', group: 'risk', visible: true, order: 31 },
]

// 分組標籤
const groupLabels = {
  market: '市場概況',
  technical: '技術指標',
  breadth: '市場廣度',
  risk: '風險指標',
}

// 從 localStorage 載入配置
function loadConfig() {
  try {
    const saved = localStorage.getItem('statsCardsConfig')
    if (saved) {
      const parsed = JSON.parse(saved)
      // 建立有效卡片 ID 集合
      const validIds = new Set(defaultCards.map(c => c.id))
      // 過濾掉已刪除的卡片（如 volMedian, upDownVol）
      const filtered = parsed.filter(c => validIds.has(c.id))
      // 確保所有預設卡片都存在（支援新增卡片）
      const savedIds = new Set(filtered.map(c => c.id))
      const merged = [...filtered]
      defaultCards.forEach(dc => {
        if (!savedIds.has(dc.id)) {
          merged.push(dc)
        }
      })
      return merged.sort((a, b) => a.order - b.order)
    }
  } catch (e) {
    console.warn('Failed to load stats config:', e)
  }
  return [...defaultCards]
}

// 儲存配置到 localStorage
function saveConfig(config) {
  try {
    localStorage.setItem('statsCardsConfig', JSON.stringify(config))
  } catch (e) {
    console.warn('Failed to save stats config:', e)
  }
}

// 摺疊狀態
function loadCollapsedGroups() {
  try {
    const saved = localStorage.getItem('statsCollapsedGroups')
    if (saved) {
      return new Set(JSON.parse(saved))
    }
  } catch (e) {
    console.warn('Failed to load collapsed groups:', e)
  }
  return new Set()
}

function saveCollapsedGroups(groups) {
  try {
    localStorage.setItem('statsCollapsedGroups', JSON.stringify([...groups]))
  } catch (e) {
    console.warn('Failed to save collapsed groups:', e)
  }
}

// 全域狀態
const cardsConfig = ref(loadConfig())
const collapsedGroups = ref(loadCollapsedGroups())

// 監聽配置變更並自動儲存
watch(cardsConfig, (newConfig) => {
  saveConfig(newConfig)
}, { deep: true })

watch(collapsedGroups, (newGroups) => {
  saveCollapsedGroups(newGroups)
}, { deep: true })

export function useStatsConfig() {
  // 重新排序卡片
  function reorderCards(newOrder) {
    newOrder.forEach((card, index) => {
      card.order = index + 1
    })
    cardsConfig.value = [...newOrder]
  }

  // 切換卡片顯示狀態
  function toggleCardVisibility(cardId) {
    const card = cardsConfig.value.find(c => c.id === cardId)
    if (card) {
      card.visible = !card.visible
    }
  }

  // 重置為預設配置
  function resetToDefault() {
    cardsConfig.value = [...defaultCards]
    collapsedGroups.value.clear()
  }

  // 依分組取得卡片
  function getCardsByGroup(group) {
    return cardsConfig.value
      .filter(card => card.group === group && card.visible)
      .sort((a, b) => a.order - b.order)
  }

  // 切換分組摺疊
  function toggleGroup(group) {
    if (collapsedGroups.value.has(group)) {
      collapsedGroups.value.delete(group)
    } else {
      collapsedGroups.value.add(group)
    }
    // 觸發 reactivity
    collapsedGroups.value = new Set(collapsedGroups.value)
  }

  return {
    cardsConfig,
    collapsedGroups,
    groupLabels,
    reorderCards,
    toggleCardVisibility,
    resetToDefault,
    getCardsByGroup,
    toggleGroup,
  }
}
