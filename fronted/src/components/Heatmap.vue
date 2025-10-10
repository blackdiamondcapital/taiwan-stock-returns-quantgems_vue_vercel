<script setup>
import { computed, reactive, toRefs } from 'vue'

const props = defineProps({
  rows: { type: Array, default: () => [] }, // [{symbol,name,return}]
})
const emit = defineEmits(['refresh'])

const state = reactive({
  search: '',
  sort: 'ret_desc',
  cellSize: 60,
  tooltip: { show: false, x: 0, y: 0, content: '' },
})

function getReturnCategory(v) {
  if (v > 5) return 'positive-high'
  if (v >= 1) return 'positive-mid'
  if (v <= -5) return 'negative-high'
  if (v <= -1) return 'negative-mid'
  return 'neutral'
}

const filteredSorted = computed(() => {
  const term = state.search.trim().toLowerCase()
  let arr = Array.isArray(props.rows) ? [...props.rows] : []
  if (term) arr = arr.filter(r => String(r.symbol).toLowerCase().includes(term) || String(r.name||'').toLowerCase().includes(term))
  switch (state.sort) {
    case 'ret_asc': arr.sort((a,b)=> Number(a.return)-Number(b.return)); break
    case 'sym_asc': arr.sort((a,b)=> String(a.symbol).localeCompare(String(b.symbol))); break
    case 'sym_desc': arr.sort((a,b)=> String(b.symbol).localeCompare(String(a.symbol))); break
    default: arr.sort((a,b)=> Number(b.return)-Number(a.return))
  }
  return arr
})

function onEnter(cell, ev){
  state.tooltip.show = true
  const sym = cell.symbol
  const val = Number(cell.return)
  state.tooltip.content = `<strong>${sym}</strong><br/>報酬率：${isFinite(val)?val.toFixed(2):'-'}%`
  updateTooltipPosition(ev?.currentTarget)
}
function onMove(ev){
  updateTooltipPosition(ev?.currentTarget)
}
function onLeave(){
  state.tooltip.show = false
}
function updateTooltipPosition(target){
  if (!target) return
  const rect = target.getBoundingClientRect()
  state.tooltip.x = rect.left + rect.width / 2
  state.tooltip.y = rect.top - 12
}

function onSizeChange(){
  document.documentElement.style.setProperty('--cell-size', `${state.cellSize}px`)
  const gap = Math.max(4, Math.round(state.cellSize * 0.12))
  document.documentElement.style.setProperty('--cell-gap', `${gap}px`)
}

</script>

<template>
  <div class="heatmap-container">
    <div class="table-header">
      <div class="table-title">
        <i class="fas fa-fire"></i>
        市場報酬率熱力圖
      </div>
      <div class="heatmap-controls">
        <input v-model="state.search" class="filter-input" type="text" placeholder="搜尋代碼/名稱…" style="min-width:160px;" />
        <select v-model="state.sort" class="filter-input" style="min-width:160px;">
          <option value="ret_desc">報酬率 高→低</option>
          <option value="ret_asc">報酬率 低→高</option>
          <option value="sym_asc">代碼 A→Z</option>
          <option value="sym_desc">代碼 Z→A</option>
        </select>
        <div style="display:flex;align-items:center;gap:8px;">
          <label class="filter-label" style="margin:0;">大小</label>
          <input v-model.number="state.cellSize" @input="onSizeChange" type="range" min="36" max="96" />
        </div>
        <button class="btn-primary" @click="emit('refresh')"><i class="fas fa-sync-alt"></i> 更新</button>
      </div>
    </div>

    <div class="heatmap-grid">
      <template v-if="filteredSorted.length">
        <div v-for="s in filteredSorted" :key="s.symbol"
             class="heatmap-cell" :class="getReturnCategory(Number(s.return))"
             @mouseenter="(e)=>onEnter(s,e)" @mousemove="onMove" @mouseleave="onLeave">
          <div class="cell-symbol">{{ s.symbol }}</div>
          <div class="cell-return">{{ Number(s.return).toFixed(1) }}%</div>
        </div>
      </template>
      <template v-else>
        <div class="heatmap-loading">
          <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
          <div class="loading-text">載入熱力圖數據中...</div>
        </div>
      </template>
    </div>

    <div class="heatmap-tooltip" v-show="state.tooltip.show"
         :style="{ left: state.tooltip.x + 'px', top: state.tooltip.y + 'px', position: 'fixed' }"
         v-html="state.tooltip.content" />
  </div>
</template>
