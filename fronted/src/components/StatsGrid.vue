<script setup>
import { computed, ref } from 'vue'
import draggable from 'vuedraggable'
import { useStatsConfig } from '../composables/useStatsConfig'
import StatsSettings from './StatsSettings.vue'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({})
  },
  period: {
    type: String,
    default: 'daily',
  },
  filters: {
    type: Object,
    default: () => ({ market: 'all', industry: 'all', returnRange: 'all', volumeThreshold: 0 }),
  },
})

const emit = defineEmits(['update:period', 'update:filters'])

const periodOptions = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '週' },
  { value: 'monthly', label: '月' },
  { value: 'quarterly', label: '季' },
  { value: 'yearly', label: '年' },
]

const marketOptions = [
  { value: 'all', label: '全部市場' },
  { value: 'listed', label: '上市' },
  { value: 'otc', label: '上櫃' },
]

const selectedMarket = computed(() => props.filters?.market ?? 'all')

const setPeriod = (value) => {
  if (value && value !== props.period) emit('update:period', value)
}

const updateFilter = (key, value) => {
  emit('update:filters', {
    ...(props.filters ?? {}),
    [key]: value,
  })
}

const { cardsConfig, collapsedGroups, groupLabels, reorderCards } = useStatsConfig()
const showSettings = ref(false)

// 格式化函數
const formatNumber = (value, digits = 0) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const formatPercent = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  return `${Number(value).toFixed(digits)}%`
}

const formatRatio = (value, digits = 2) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--'
  return `${Number(value).toFixed(digits)}x`
}

const formatValue = (value, digits = 0) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  const num = Number(value)
  if (num >= 10000) {
    return (num / 10000).toFixed(2) + '兆'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + '千'
  }
  return num.toFixed(digits)
}

// 計算統計數據
const s = computed(() => props.stats || {})
const totalCount = computed(() => Number(s.value.totalCount || 0))

// 依分組計算卡片
const cardsByGroup = computed(() => {
  const groups = {}
  cardsConfig.value.forEach(card => {
    if (card.visible) {
      if (!groups[card.group]) groups[card.group] = []
      groups[card.group].push(card)
    }
  })
  return groups
})

const isGroupCollapsed = (group) => collapsedGroups.value.has(group)
const toggleGroup = (group) => {
  if (collapsedGroups.value.has(group)) {
    collapsedGroups.value.delete(group)
  } else {
    collapsedGroups.value.add(group)
  }
  // 觸發 reactivity
  collapsedGroups.value = new Set(collapsedGroups.value)
}

const handleDragEnd = () => {
  reorderCards(cardsConfig.value)
}
</script>

<template>
  <div class="stats-grid-container">
    <!-- 標題與篩選控制 -->
    <div class="stats-header">
      <div class="stats-header-left">
        <h3 class="stats-title">市場指標</h3>
      </div>
      <div class="stats-header-center">
        <div class="period-toolbar">
          <div 
            class="period-chip-group"
            :style="{
              '--active-index': activePeriodIndex,
              '--chip-count': periodOptions.length
            }"
          >
            <button
              v-for="item in periodOptions"
              :key="item.value"
              type="button"
              class="period-chip"
              :class="{ active: item.value === period }"
              @click="setPeriod(item.value)"
            >{{ item.label }}</button>
          </div>
          <select class="market-select market-inline" :value="selectedMarket" @change="updateFilter('market', $event.target.value)">
            <option v-for="item in marketOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>
      </div>
      <div class="stats-header-right">
        <button class="settings-btn" @click="showSettings = true" title="卡片設定">
          <i class="fas fa-cog"></i>
          <span>自訂顯示</span>
        </button>
      </div>
    </div>

    <!-- 分組顯示卡片 -->
    <div v-for="(cards, groupKey) in cardsByGroup" :key="groupKey" class="stats-group">
      <div class="group-header-bar" @click="toggleGroup(groupKey)">
        <i class="fas" :class="isGroupCollapsed(groupKey) ? 'fa-chevron-right' : 'fa-chevron-down'"></i>
        <span class="group-name">{{ groupLabels[groupKey] }}</span>
        <span class="group-badge">{{ cards.length }}</span>
      </div>
      
      <transition name="group-collapse">
        <draggable
          v-show="!isGroupCollapsed(groupKey)"
          v-model="cardsConfig"
          class="stats-grid"
          item-key="id"
          :animation="200"
          @end="handleDragEnd"
          handle=".drag-handle"
        >
          <template #item="{ element }">
            <div
              v-if="element.visible && element.group === groupKey"
              class="stat-card"
              :id="'card' + element.id.charAt(0).toUpperCase() + element.id.slice(1)"
            >
              <div class="drag-handle" title="拖曳排序">
                <i class="fas fa-grip-vertical"></i>
              </div>
              
              <!-- 卡片內容 -->
              <div class="stat-content">
                <!-- 今日上漲股票數 -->
                <div v-if="element.id === 'rising'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-arrow-trend-up"></i></div>
                    <div class="stat-label">今日上漲股票數</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.risingStocks) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">上漲：{{ formatNumber(s.advancersCount) }}</span>
                    <span class="muted">下跌：{{ formatNumber(s.declinersCount) }}</span>
                  </div>
                </div>

                <!-- 今日下跌股票數 -->
                <div v-else-if="element.id === 'falling'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-arrow-trend-down"></i></div>
                    <div class="stat-label">今日下跌股票數</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.declinersCount ?? s.decliners ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">下跌：{{ formatNumber(s.declinersCount ?? s.decliners ?? 0) }}</span>
                    <span class="muted">持平：{{ formatNumber(s.unchangedCount ?? s.unchanged ?? 0) }}</span>
                  </div>
                </div>

                <!-- 平盤股票數 -->
                <div v-else-if="element.id === 'unchanged'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-minus"></i></div>
                    <div class="stat-label">平盤股票數</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.unchangedCount ?? s.unchanged ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">平盤：{{ formatNumber(s.unchangedCount ?? s.unchanged ?? 0) }}</span>
                    <span class="muted">佔比：{{ formatPercent((s.unchangedCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 漲停/跌停股票數 -->
                <div v-else-if="element.id === 'limitUpDown'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-line-up"></i></div>
                    <div class="stat-label">漲停/跌停股票數</div>
                  </div>
                  <div class="stat-value" style="display: flex; gap: 12px; align-items: baseline;">
                    <span style="color: #ef4444;">{{ formatNumber(s.limitUpCount ?? 0) }}</span>
                    <span style="font-size: 0.8em; color: #888;">/</span>
                    <span style="color: #22c55e;">{{ formatNumber(s.limitDownCount ?? 0) }}</span>
                  </div>
                  <div class="stat-subinfo">
                    <span style="color: #ef4444;">
                      <span class="dot" style="background:#ef4444"></span>
                      漲停：{{ formatPercent((s.limitUpCount ?? 0) / totalCount * 100, 1) }}
                    </span>
                    <span style="color: #22c55e;">
                      <span class="dot" style="background:#22c55e"></span>
                      跌停：{{ formatPercent((s.limitDownCount ?? 0) / totalCount * 100, 1) }}
                    </span>
                  </div>
                </div>

                <!-- 成交金額 -->
                <div v-else-if="element.id === 'totalValue'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="stat-label">成交金額</div>
                  </div>
                  <div class="stat-value">
                    {{ formatNumber(s.totalValue ?? 0, 2) }} 千億
                  </div>
                  <div class="stat-subinfo">
                    <span :style="{ color: (s.valueChange ?? 0) >= 0 ? '#ef4444' : '#22c55e' }">
                      <span class="dot" :style="{ background: (s.valueChange ?? 0) >= 0 ? '#ef4444' : '#22c55e' }"></span>
                      較昨日：{{ (s.valueChange ?? 0) >= 0 ? '+' : '' }}{{ formatPercent(s.valueChange ?? 0, 1) }}
                    </span>
                    <span class="muted">
                      {{ (s.totalValue ?? 0) > (s.avgValue20 ?? 0) ? '放量' : '縮量' }}
                      {{ formatPercent(((s.totalValue ?? 0) / (s.avgValue20 ?? 1) - 1) * 100, 0) }}
                    </span>
                  </div>
                </div>

                <!-- 本月最佳報酬 -->
                <div v-else-if="element.id === 'topReturn'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-crown"></i></div>
                    <div class="stat-label">本月最佳報酬</div>
                  </div>
                  <div class="stat-value">{{ s.topStock || 'N/A' }}</div>
                  <div class="stat-subinfo">
                    <span><span class="dot" style="background:#00d4ff"></span>報酬：{{ formatPercent(s.maxReturn, 2) }}</span>
                  </div>
                </div>

                <!-- 市場平均報酬率 -->
                <div v-else-if="element.id === 'avgReturn'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-pie"></i></div>
                    <div class="stat-label">市場平均報酬率</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.avgReturn, 1) }}</div>
                  <div class="stat-subinfo">
                    <span><span class="dot" style="background:#888"></span>市場樣本：{{ formatNumber(totalCount) }}</span>
                    <span class="muted">上漨：{{ formatNumber(s.advancersCount) }} 下跌：{{ formatNumber(s.declinersCount) }}</span>
                  </div>
                </div>

                <!-- 突破新高股票 -->
                <div v-else-if="element.id === 'newHigh'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-fire"></i></div>
                    <div class="stat-label">突破新高股票</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.newHighStocks) }}</div>
                  <div class="stat-subinfo">
                    <span><span class="dot" style="background:#ff0080"></span>淨新高 {{ formatNumber(s.newHighNet) }}</span>
                    <span class="muted">新高：{{ formatNumber(s.newHighStocks) }} 新低：{{ formatNumber(s.newLowStocks) }}</span>
                  </div>
                </div>

                <!-- 站上 MA5 比例 -->
                <div v-else-if="element.id === 'ma5'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-label">站上 MA5 比例</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.ma5Ratio ?? 0, 1) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">站上：{{ formatNumber(s.ma5AboveCount ?? 0) }}</span>
                    <span class="muted">樣本：{{ formatNumber(s.ma5SampleCount ?? 0) }}</span>
                  </div>
                </div>

                <!-- 站上 MA10 比例 -->
                <div v-else-if="element.id === 'ma10'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-label">站上 MA10 比例</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.ma10Ratio ?? 0, 1) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">站上：{{ formatNumber(s.ma10AboveCount ?? 0) }}</span>
                    <span class="muted">樣本：{{ formatNumber(s.ma10SampleCount ?? 0) }}</span>
                  </div>
                </div>

                <!-- 站上 MA20 比例 -->
                <div v-else-if="element.id === 'ma20'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-area"></i></div>
                    <div class="stat-label">站上 MA20 比例</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.ma20Ratio, 1) }}</div>
                  <div class="stat-subinfo">
                    <span><span class="dot" style="background:#22c55e"></span>站上：{{ formatNumber(s.ma20AboveCount) }}</span>
                    <span class="muted">樣本：{{ formatNumber(s.ma20SampleCount) }}</span>
                  </div>
                </div>

                <!-- 站上 MA60 比例 -->
                <div v-else-if="element.id === 'ma60'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-label">站上 MA60 比例</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.ma60Ratio, 1) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">站上：{{ formatNumber(s.ma60AboveCount) }}</span>
                    <span class="muted">樣本：{{ formatNumber(s.ma60SampleCount) }}</span>
                  </div>
                </div>

                <!-- 站上 MA120 比例 -->
                <div v-else-if="element.id === 'ma120'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-label">站上 MA120 比例</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.ma120Ratio ?? 0, 1) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">站上：{{ formatNumber(s.ma120AboveCount ?? 0) }}</span>
                    <span class="muted">樣本：{{ formatNumber(s.ma120SampleCount ?? 0) }}</span>
                  </div>
                </div>

                <!-- 站上 MA240 比例 -->
                <div v-else-if="element.id === 'ma240'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-label">站上 MA240 比例</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.ma240Ratio ?? 0, 1) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">站上：{{ formatNumber(s.ma240AboveCount ?? 0) }}</span>
                    <span class="muted">樣本：{{ formatNumber(s.ma240SampleCount ?? 0) }}</span>
                  </div>
                </div>

                <!-- 黃金交叉股票數 -->
                <div v-else-if="element.id === 'goldenCross'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-sparkles"></i></div>
                    <div class="stat-label">黃金交叉股票數</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.goldenCrossCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span style="color: #ef4444;">
                      <span class="dot" style="background:#ef4444"></span>
                      MA5↑MA20：{{ formatNumber(s.goldenCross5_20 ?? s.golden_cross_5_20 ?? 0) }}
                    </span>
                    <span style="color: #f59e0b;">
                      <span class="dot" style="background:#f59e0b"></span>
                      MA10↑MA60：{{ formatNumber(s.goldenCross10_60 ?? s.golden_cross_10_60 ?? 0) }}
                    </span>
                  </div>
                </div>

                <!-- 死亡交叉股票數 -->
                <div v-else-if="element.id === 'deathCross'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-skull-crossbones"></i></div>
                    <div class="stat-label">死亡交叉股票數</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.deathCrossCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span style="color: #22c55e;">
                      <span class="dot" style="background:#22c55e"></span>
                      MA5↓MA20：{{ formatNumber(s.deathCross5_20 ?? s.death_cross_5_20 ?? 0) }}
                    </span>
                    <span style="color: #10b981;">
                      <span class="dot" style="background:#10b981"></span>
                      MA10↓MA60：{{ formatNumber(s.deathCross10_60 ?? s.death_cross_10_60 ?? 0) }}
                    </span>
                  </div>
                </div>

                <!-- 多頭排列股票數 -->
                <div v-else-if="element.id === 'bullishAlignment'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-arrow-trend-up"></i></div>
                    <div class="stat-label">多頭排列股票數</div>
                  </div>
                  <div class="stat-value" style="color: #ef4444;">{{ formatNumber(s.bullishAlignmentCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">MA5 &gt; MA10 &gt; MA20 &gt; MA60</span>
                    <span class="muted">佔比：{{ formatPercent((s.bullishAlignmentCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 空頭排列股票數 -->
                <div v-else-if="element.id === 'bearishAlignment'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-arrow-trend-down"></i></div>
                    <div class="stat-label">空頭排列股票數</div>
                  </div>
                  <div class="stat-value" style="color: #22c55e;">{{ formatNumber(s.bearishAlignmentCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">MA5 &lt; MA10 &lt; MA20 &lt; MA60</span>
                    <span class="muted">佔比：{{ formatPercent((s.bearishAlignmentCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 上漲家數 / 下跌家數 比 -->
                <div v-else-if="element.id === 'adRatio'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-balance-scale-left"></i></div>
                    <div class="stat-label">上漲/下跌 比</div>
                  </div>
                  <div class="stat-value">{{ formatRatio(s.adRatio, 2) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">上漲：{{ formatNumber(s.advancersCount) }}</span>
                    <span class="muted">下跌：{{ formatNumber(s.decliners) }}</span>
                  </div>
                </div>

                <!-- 騰落線（ADL） -->
                <div v-else-if="element.id === 'advanceDeclineLine'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-area"></i></div>
                    <div class="stat-label">騰落線（ADL）</div>
                  </div>
                  <div class="stat-value" :style="{ color: (s.adlValue ?? 0) >= 0 ? '#ef4444' : '#22c55e' }">
                    {{ (s.adlValue ?? 0) >= 0 ? '+' : '' }}{{ formatNumber(s.adlValue ?? 0) }}
                  </div>
                  <div class="stat-subinfo">
                    <span class="muted">累計上漲 - 下跌</span>
                    <span :style="{ color: (s.adlChange ?? 0) >= 0 ? '#ef4444' : '#22c55e' }">
                      較昨日：{{ (s.adlChange ?? 0) >= 0 ? '+' : '' }}{{ formatNumber(s.adlChange ?? 0) }}
                    </span>
                  </div>
                </div>

                <!-- 新高/新低股票數 -->
                <div v-else-if="element.id === 'newHighLow'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-mountain"></i></div>
                    <div class="stat-label">新高/新低股票數</div>
                  </div>
                  <div class="stat-value" style="display: flex; gap: 12px; align-items: baseline;">
                    <span style="color: #ef4444;">{{ formatNumber(s.newHighStocks ?? 0) }}</span>
                    <span style="font-size: 0.8em; color: #888;">/</span>
                    <span style="color: #22c55e;">{{ formatNumber(s.newLowStocks ?? 0) }}</span>
                  </div>
                  <div class="stat-subinfo">
                    <span style="color: #ef4444;">
                      <span class="dot" style="background:#ef4444"></span>
                      新高：{{ formatNumber(s.newHighStocks ?? 0) }}
                    </span>
                    <span :style="{ color: (s.newHighNet ?? 0) >= 0 ? '#ef4444' : '#22c55e' }">
                      <span class="dot" :style="{ background: (s.newHighNet ?? 0) >= 0 ? '#ef4444' : '#22c55e' }"></span>
                      淨值：{{ (s.newHighNet ?? 0) >= 0 ? '+' : '' }}{{ formatNumber(s.newHighNet ?? 0) }}
                    </span>
                  </div>
                </div>

                <!-- 上漲幅度分布 -->
                <div v-else-if="element.id === 'gainDistribution'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-bar"></i></div>
                    <div class="stat-label">上漲幅度分布</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.advancersCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span style="color: #dc2626;">
                      <span class="dot" style="background:#dc2626"></span>
                      &gt;5%：{{ formatNumber(s.gain5PlusCount ?? 0) }}
                    </span>
                    <span style="color: #f59e0b;">
                      <span class="dot" style="background:#f59e0b"></span>
                      2-5%：{{ formatNumber(s.gain2To5Count ?? 0) }}
                    </span>
                    <span style="color: #fbbf24;">
                      <span class="dot" style="background:#fbbf24"></span>
                      0-2%：{{ formatNumber(s.gain0To2Count ?? 0) }}
                    </span>
                  </div>
                </div>

                <!-- 下跌幅度分布 -->
                <div v-else-if="element.id === 'lossDistribution'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-chart-bar"></i></div>
                    <div class="stat-label">下跌幅度分布</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.declinersCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span style="color: #059669;">
                      <span class="dot" style="background:#059669"></span>
                      &lt;-5%：{{ formatNumber(s.loss5PlusCount ?? 0) }}
                    </span>
                    <span style="color: #10b981;">
                      <span class="dot" style="background:#10b981"></span>
                      -5~-2%：{{ formatNumber(s.loss2To5Count ?? 0) }}
                    </span>
                    <span style="color: #34d399;">
                      <span class="dot" style="background:#34d399"></span>
                      -2~0%：{{ formatNumber(s.loss0To2Count ?? 0) }}
                    </span>
                  </div>
                </div>

                <!-- 市場參與度 -->
                <div v-else-if="element.id === 'marketParticipation'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-label">市場參與度</div>
                  </div>
                  <div class="stat-value">{{ formatPercent((s.activeStocksCount ?? 0) / totalCount * 100, 1) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">活躍：{{ formatNumber(s.activeStocksCount ?? 0) }}</span>
                    <span class="muted">冷清：{{ formatNumber(s.inactiveStocksCount ?? 0) }}</span>
                  </div>
                </div>

                <!-- 高波動警示比例 -->
                <div v-else-if="element.id === 'hiVol'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-signal"></i></div>
                    <div class="stat-label">高波動警示比例</div>
                  </div>
                  <div class="stat-value">{{ formatPercent(s.hiVolatilityRatio, 1) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">波動≥5%：{{ formatNumber(s.highVolatilityCount) }}</span>
                    <span class="muted">樣本：{{ formatNumber(totalCount) }}</span>
                  </div>
                </div>

                <!-- 跌幅超過 5% 股票數 -->
                <div v-else-if="element.id === 'heavyLosers'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="stat-label">跌幅超過 5% 股票數</div>
                  </div>
                  <div class="stat-value" style="color: #f59e0b;">{{ formatNumber(s.heavyLosersCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">跌幅 &gt; 5%</span>
                    <span class="muted">佔比：{{ formatPercent((s.heavyLosersCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 跌幅超過 7% 股票數 -->
                <div v-else-if="element.id === 'severeDecliners'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-exclamation-circle"></i></div>
                    <div class="stat-label">跌幅超過 7% 股票數</div>
                  </div>
                  <div class="stat-value" style="color: #ef4444;">{{ formatNumber(s.severeDeclinersCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">跌幅 &gt; 7%</span>
                    <span class="muted">佔比：{{ formatPercent((s.severeDeclinersCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 跌幅超過 10% 股票數 -->
                <div v-else-if="element.id === 'crashStocks'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-bomb"></i></div>
                    <div class="stat-label">跌幅超過 10% 股票數</div>
                  </div>
                  <div class="stat-value" style="color: #dc2626;">{{ formatNumber(s.crashStocksCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">跌幅 &gt; 10%（重挫）</span>
                    <span class="muted">佔比：{{ formatPercent((s.crashStocksCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 連續下跌股票數 -->
                <div v-else-if="element.id === 'consecutiveDecliners'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-arrow-trend-down"></i></div>
                    <div class="stat-label">連續下跌股票數</div>
                  </div>
                  <div class="stat-value" style="color: #22c55e;">{{ formatNumber(s.consecutiveDeclinersCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">連續 3 日下跌</span>
                    <span class="muted">佔比：{{ formatPercent((s.consecutiveDeclinersCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 破底股票數 -->
                <div v-else-if="element.id === 'breakdownStocks'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-mountain"></i></div>
                    <div class="stat-label">破底股票數</div>
                  </div>
                  <div class="stat-value" style="color: #10b981;">{{ formatNumber(s.breakdownStocksCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">跌破 MA60</span>
                    <span class="muted">佔比：{{ formatPercent((s.breakdownStocksCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>

                <!-- 成交量萎縮股票數 -->
                <div v-else-if="element.id === 'volumeDryStocks'">
                  <div class="stat-header">
                    <div class="stat-icon"><i class="fas fa-droplet-slash"></i></div>
                    <div class="stat-label">成交量萎縮股票數</div>
                  </div>
                  <div class="stat-value">{{ formatNumber(s.volumeDryStocksCount ?? 0) }}</div>
                  <div class="stat-subinfo">
                    <span class="muted">量 &lt; 20日均量 50%</span>
                    <span class="muted">佔比：{{ formatPercent((s.volumeDryStocksCount ?? 0) / totalCount * 100, 1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </draggable>
      </transition>
    </div>

    <!-- Settings Modal -->
    <StatsSettings v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.stats-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stats-header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
}

.stats-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.period-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.period-chip-group {
  display: inline-flex;
  gap: 8px;
  padding: 6px;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(100, 200, 255, 0.2);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.period-chip {
  min-width: 48px;
  min-height: 36px;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: rgba(226, 232, 240, 0.85);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

/* 悬浮反馈 */
.period-chip:hover {
  color: rgba(255, 255, 255, 0.95);
  background: rgba(100, 200, 255, 0.08);
  border-color: rgba(100, 200, 255, 0.3);
}

/* 选中状态 - 清晰光环 */
.period-chip.active {
  color: #ffffff;
  background: rgba(100, 200, 255, 0.15);
  border-color: rgba(100, 200, 255, 0.6);
  box-shadow: 
    0 0 20px rgba(100, 200, 255, 0.3),
    inset 0 0 12px rgba(100, 200, 255, 0.15);
  font-weight: 600;
}

/* 点击反馈 */
.period-chip:active {
  transform: scale(0.98);
}

/* 键盘焦点可访问性 */
.period-chip:focus-visible {
  outline: 2px solid rgba(100, 200, 255, 0.8);
  outline-offset: 2px;
}

.market-select {
  appearance: none;
  padding: 0.45rem 2.2rem 0.45rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(63, 182, 255, 0.35);
  background: rgba(12, 22, 48, 0.75);
  color: var(--text-primary, #fff);
  font-size: 0.9rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 12px 28px rgba(6, 18, 41, 0.35);
  transition: all 0.2s ease;
  position: relative;
}

.market-select:hover,
.market-select:focus {
  border-color: rgba(63, 182, 255, 0.65);
  outline: none;
  box-shadow: 0 14px 32px rgba(63, 182, 255, 0.3);
}

.market-select option {
  color: #111827;
}

.stats-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: var(--text-primary, #fff);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.stats-group {
  margin-bottom: 24px;
}

.group-header-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  position: relative;
  overflow: hidden;
}

.group-header-bar::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(180deg, rgba(63, 182, 255, 0.8), rgba(255, 0, 128, 0.8));
  transform: scaleY(0);
  transition: transform 0.3s ease;
}

.group-header-bar:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateX(4px);
  box-shadow: 0 4px 20px rgba(63, 182, 255, 0.2);
}

.group-header-bar:hover::before {
  transform: scaleY(1);
}

.group-name {
  font-weight: 600;
  flex: 1;
}

.group-badge {
  background: rgba(102, 126, 234, 0.3);
  color: #667eea;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

/* 卡片基础样式 + 流光边框 */
.stat-card {
  position: relative;
  animation: cardFadeIn 0.6s ease-out backwards;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 20px;
  border-radius: 18px;
}

/* 错落进入动画 */
.stat-card:nth-child(1) { animation-delay: 0.05s; }
.stat-card:nth-child(2) { animation-delay: 0.1s; }
.stat-card:nth-child(3) { animation-delay: 0.15s; }
.stat-card:nth-child(4) { animation-delay: 0.2s; }
.stat-card:nth-child(5) { animation-delay: 0.25s; }
.stat-card:nth-child(6) { animation-delay: 0.3s; }
.stat-card:nth-child(7) { animation-delay: 0.35s; }
.stat-card:nth-child(8) { animation-delay: 0.4s; }
.stat-card:nth-child(9) { animation-delay: 0.45s; }
.stat-card:nth-child(10) { animation-delay: 0.5s; }

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 卡片悬停效果增强 */
.stat-card:hover {
  transform: translateY(-6px) scale(1.015);
  box-shadow: 
    0 16px 48px rgba(63, 182, 255, 0.22),
    0 0 32px rgba(255, 0, 128, 0.12),
    inset 0 0 24px rgba(63, 182, 255, 0.06);
}

.drag-handle {
  position: absolute;
  top: 8px;
  right: 8px;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--text-secondary, #aaa);
  padding: 4px;
}

.stat-card:hover .drag-handle {
  opacity: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.stat-content {
  width: 100%;
}

.stat-label {
  display: inline-block;
  text-align: left;
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.025em;
  text-transform: none;
  transition: color 0.2s ease;
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.stat-icon {
  font-size: 1.3rem;
  color: rgba(63, 182, 255, 0.9);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-value {
  font-size: 2.2rem;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
  font-variant-numeric: tabular-nums;
  text-align: center;
  margin: 12px 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: #ffffff;
  text-shadow: 0 2px 12px rgba(96, 165, 250, 0.35), 0 0 24px rgba(96, 165, 250, 0.2);
  transition: all 0.3s ease;
  position: relative;
}

.stat-card:hover .stat-value {
  transform: scale(1.03);
  text-shadow: 0 4px 20px rgba(96, 165, 250, 0.5), 0 0 32px rgba(96, 165, 250, 0.3);
}

.stat-subinfo {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  text-align: center;
  font-size: 0.88rem;
}

.group-collapse-enter-active,
.group-collapse-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.group-collapse-enter-from,
.group-collapse-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-20px);
}

.group-collapse-enter-to,
.group-collapse-leave-from {
  opacity: 1;
  max-height: 2000px;
  transform: translateY(0);
}

/* 背景光效 */
@keyframes bgShimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.stats-grid-container {
  position: relative;
}


/* === 響應式設計 (Mobile-First) === */

/* 手機版 (<640px) */
@media (max-width: 639px) {
  .stats-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .stats-header-left,
  .stats-header-center,
  .stats-header-right {
    width: 100%;
    justify-content: center;
  }

  .stats-title {
    font-size: 1.25rem;
    text-align: center;
  }

  .period-toolbar {
    flex-direction: column;
    width: 100%;
    gap: 8px;
  }

  .period-chip-group {
    width: 100%;
    justify-content: space-between;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .period-chip-group::-webkit-scrollbar {
    display: none;
  }

  .period-chip {
    min-width: 44px;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    flex: 1 0 auto;
  }

  .market-select {
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 2.2rem 0.6rem 1rem;
    font-size: 1rem;
  }

  .settings-btn {
    width: 100%;
    justify-content: center;
    min-height: 44px;
    padding: 10px 16px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .stat-card {
    padding: 20px 18px !important;
    min-height: auto !important;
  }

  .stat-header {
    gap: 10px !important;
    margin-bottom: 14px !important;
  }

  .stat-label {
    font-size: 1rem !important;
    line-height: 1.4 !important;
  }

  .stat-icon {
    font-size: 1.4rem !important;
    flex-shrink: 0 !important;
  }

  .stat-value {
    font-size: 2rem !important;
    margin: 16px 0 !important;
    line-height: 1.2 !important;
  }

  .stat-subinfo {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 8px !important;
    font-size: 0.9rem !important;
    margin-top: 12px !important;
  }

  .stat-subinfo span {
    display: block !important;
    width: 100% !important;
    line-height: 1.5 !important;
  }


  .group-header-bar {
    padding: 12px 14px;
  }

  .group-name {
    font-size: 0.95rem;
  }
}

/* 小平板 (640px - 767px) */
@media (min-width: 640px) and (max-width: 767px) {
  .stats-header {
    flex-wrap: wrap;
  }

  .stats-header-center {
    order: 3;
    width: 100%;
    margin-top: 8px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .period-chip {
    min-height: 40px;
  }

  .stat-value {
    font-size: 2rem;
  }
}

/* 平板 (768px - 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .period-toolbar {
    flex-wrap: wrap;
    justify-content: center;
  }

  .stat-value {
    font-size: 2.1rem;
  }
}

/* 桌面 (1024px+) */
@media (min-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* 大螢幕 (1440px+) */
@media (min-width: 1440px) {
  .stats-grid {
    grid-template-columns: repeat(5, 1fr);
    gap: 18px;
  }

  .stat-card {
    padding: 22px;
  }

  .stat-value {
    font-size: 2.4rem;
  }
}

/* 超大螢幕 (1920px+) */
@media (min-width: 1920px) {
  .stats-grid {
    grid-template-columns: repeat(6, 1fr);
    gap: 20px;
  }
}

/* Touch 設備優化 */
@media (hover: none) and (pointer: coarse) {
  .period-chip,
  .settings-btn,
  .group-header-bar {
    min-height: 44px;
  }

  .period-chip:active {
    transform: scale(0.96);
    background: rgba(100, 200, 255, 0.2);
  }

  .stat-card:hover {
    transform: none;
  }

  .drag-handle {
    opacity: 1;
    font-size: 1.2rem;
  }
}
</style>

