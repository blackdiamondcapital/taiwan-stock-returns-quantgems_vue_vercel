import { ref, watch } from 'vue'

// 預設卡片配置
const defaultCards = [
  { id: 'rising', label: '今日上漲股票數', group: 'market', visible: true, order: 1 },
  { id: 'falling', label: '今日下跌股票數', group: 'market', visible: true, order: 2 },
  { id: 'topReturn', label: '本月最佳報酬', group: 'market', visible: true, order: 3 },
  { id: 'avgReturn', label: '市場平均報酬率', group: 'market', visible: true, order: 4 },
  { id: 'newHigh', label: '突破新高股票', group: 'market', visible: true, order: 5 },
  { id: 'ma60', label: '站上 MA60 比例', group: 'technical', visible: true, order: 6 },
  { id: 'ma20', label: '站上 MA20 比例', group: 'technical', visible: true, order: 7 },
  { id: 'adRatio', label: '上漲/下跌 比', group: 'breadth', visible: true, order: 8 },
  { id: 'volMedian', label: '成交量中位數', group: 'volume', visible: true, order: 9 },
  { id: 'upDownVol', label: '量能比', group: 'volume', visible: true, order: 10 },
  { id: 'hiVol', label: '高波動警示比例', group: 'risk', visible: true, order: 11 },
]

// 分組標籤
const groupLabels = {
  market: '市場概況',
  technical: '技術指標',
  breadth: '市場廣度',
  volume: '成交量',
  risk: '風險指標',
}

// 從 localStorage 載入配置
function loadConfig() {
  try {
    const saved = localStorage.getItem('statsCardsConfig')
    if (saved) {
      const parsed = JSON.parse(saved)
      // 確保所有預設卡片都存在（支援新增卡片）
      const savedIds = new Set(parsed.map(c => c.id))
      const merged = [...parsed]
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
