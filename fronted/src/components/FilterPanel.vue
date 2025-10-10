<script setup>
const props = defineProps({
  period: { type: String, default: 'daily' },
  filters: { type: Object, default: () => ({ market: 'all', industry: 'all', returnRange: 'all', volumeThreshold: 0 }) },
})
const emit = defineEmits(['update:period', 'update:filters'])
const periodOptions = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '週' },
  { value: 'monthly', label: '月' },
  { value: 'quarterly', label: '季' },
  { value: 'yearly', label: '年' },
]
function setPeriod(p){ emit('update:period', p) }
function updateFilter(key, value){ emit('update:filters', { ...props.filters, [key]: value }) }
</script>

<template>
  <div class="filter-panel overview-filter-panel">
    <div class="ranking-header-card overview-header-card">
      <div class="ranking-header-top">
        <div class="table-title">
          <i class="fas fa-filter"></i>
          篩選條件
        </div>
        <div class="ranking-period-control">
          <button
            v-for="item in periodOptions"
            :key="item.value"
            type="button"
            class="period-chip"
            :class="{ active: period === item.value }"
            @click="setPeriod(item.value)"
          >{{ item.label }}</button>
        </div>
      </div>
      <div class="ranking-filter-bar overview-filter-bar">
        <label class="filter-label">市場別</label>
        <select class="filter-input overview-select" :value="filters.market" @change="e=>updateFilter('market', e.target.value)">
          <option value="all">全部市場</option>
          <option value="listed">上市</option>
          <option value="otc">上櫃</option>
        </select>
      </div>
    </div>
  </div>
</template>
