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

// 偵測是否為觸控設備
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

function onEnter(cell, ev){
  if (isTouchDevice) return // 觸控設備使用 click
  state.tooltip.show = true
  const sym = cell.symbol
  const val = Number(cell.return)
  state.tooltip.content = `<strong>${sym}</strong><br/>報酬率：${isFinite(val)?val.toFixed(2):'-'}%`
  updateTooltipPosition(ev?.currentTarget)
}

function onMove(ev){
  if (isTouchDevice) return
  updateTooltipPosition(ev?.currentTarget)
}

function onLeave(){
  if (isTouchDevice) return
  state.tooltip.show = false
}

function onClick(cell, ev){
  // 觸控設備點擊顯示 tooltip
  if (!isTouchDevice) return
  state.tooltip.show = true
  const sym = cell.symbol
  const val = Number(cell.return)
  state.tooltip.content = `<strong>${sym}</strong><br/>報酬率：${isFinite(val)?val.toFixed(2):'-'}%`
  updateTooltipPosition(ev?.currentTarget)
  
  // 3秒後自動隱藏
  setTimeout(() => {
    state.tooltip.show = false
  }, 3000)
}

function updateTooltipPosition(target){
  if (!target) return
  const rect = target.getBoundingClientRect()
  
  if (isTouchDevice) {
    // 手機版固定在底部中央（透過 CSS 控制）
    state.tooltip.x = window.innerWidth / 2
    state.tooltip.y = window.innerHeight - 80
  } else {
    // 桌面版跟隨滑鼠
    state.tooltip.x = rect.left + rect.width / 2
    state.tooltip.y = rect.top - 12
  }
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
             @mouseenter="(e)=>onEnter(s,e)" 
             @mousemove="onMove" 
             @mouseleave="onLeave"
             @click="(e)=>onClick(s,e)">
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

<style scoped>
/* === 響應式設計 === */

/* 手機版 (<640px) */
@media (max-width: 639px) {
  .table-header {
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .table-title {
    font-size: 1.1rem;
    text-align: center;
    width: 100%;
  }

  .heatmap-controls {
    flex-direction: column;
    width: 100%;
    gap: 10px;
  }

  .heatmap-controls .filter-input,
  .heatmap-controls select {
    width: 100% !important;
    min-width: unset !important;
    min-height: 44px;
    font-size: 1rem;
    padding: 0.6rem 1rem;
  }

  .heatmap-controls > div {
    width: 100%;
    justify-content: space-between;
  }

  .heatmap-controls input[type="range"] {
    flex: 1;
    min-height: 44px;
  }

  .heatmap-controls .btn-primary {
    width: 100%;
    min-height: 44px;
    justify-content: center;
  }

  .heatmap-grid {
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)) !important;
    grid-auto-rows: 70px !important;
    gap: 8px !important;
    padding: 12px;
  }

  .heatmap-cell {
    min-width: 70px !important;
    min-height: 70px !important;
    padding: 6px;
  }

  .cell-symbol {
    font-size: 0.85rem;
  }

  .cell-return {
    font-size: 0.75rem;
  }

  /* 手機版 tooltip 固定在底部 */
  .heatmap-tooltip {
    position: fixed !important;
    left: 50% !important;
    top: auto !important;
    bottom: 20px !important;
    transform: translateX(-50%) !important;
    max-width: 90vw;
    padding: 12px 16px;
    font-size: 0.95rem;
    z-index: 9999;
  }
}

/* 小平板 (640px - 767px) */
@media (min-width: 640px) and (max-width: 767px) {
  .table-header {
    flex-wrap: wrap;
    gap: 12px;
  }

  .heatmap-controls {
    flex-wrap: wrap;
    width: 100%;
    gap: 10px;
  }

  .heatmap-controls .filter-input,
  .heatmap-controls select {
    flex: 1 1 45%;
    min-width: 140px;
    min-height: 44px;
  }

  .heatmap-controls .btn-primary {
    min-height: 44px;
  }

  .heatmap-grid {
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)) !important;
    grid-auto-rows: 64px !important;
  }
}

/* 平板 (768px - 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
  .heatmap-controls {
    flex-wrap: wrap;
    gap: 10px;
  }

  .heatmap-controls .filter-input,
  .heatmap-controls select {
    min-height: 40px;
  }

  .heatmap-grid {
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)) !important;
    grid-auto-rows: 60px !important;
  }
}

/* Touch 設備優化 */
@media (hover: none) and (pointer: coarse) {
  .heatmap-cell {
    cursor: pointer;
    min-width: 64px;
    min-height: 64px;
  }

  /* Touch 設備使用 click 事件而非 hover */
  .heatmap-cell:active {
    transform: scale(0.95);
    opacity: 0.9;
  }

  .heatmap-controls input[type="range"] {
    min-height: 44px;
    padding: 10px 0;
  }
}

/* 大螢幕優化 (1440px+) */
@media (min-width: 1440px) {
  .heatmap-container {
    padding: 24px;
  }

  .table-header {
    padding: 20px 24px;
  }

  .heatmap-grid {
    padding: 20px;
  }
}
</style>
