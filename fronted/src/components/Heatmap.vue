<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  rows: { type: Array, default: () => [] }, // [{symbol,name,return}]
})
const emit = defineEmits(['refresh'])

const state = reactive({
  search: '',
  sort: 'ret_desc',
  cellSize: 60,
})

// 側邊面板狀態
const detailPanel = reactive({
  show: false,
  stock: null,
  pinned: false,
})

function getReturnCategory(v) {
  if (v > 5) return 'positive-high'
  if (v >= 1) return 'positive-mid'
  if (v <= -5) return 'negative-high'
  if (v <= -1) return 'negative-mid'
  return 'neutral'
}

function getCategoryLabel(v) {
  if (v > 5) return '強勢上漲'
  if (v >= 1) return '溫和上漲'
  if (v <= -5) return '大幅下跌'
  if (v <= -1) return '小幅下跌'
  return '持平'
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

// 點擊格子顯示詳情面板
function showDetail(stock) {
  console.log('showDetail called', stock)
  detailPanel.stock = stock
  detailPanel.show = true
  console.log('detailPanel state:', detailPanel)
}

// 關閉面板
function closeDetail() {
  if (detailPanel.pinned) return
  detailPanel.show = false
  detailPanel.stock = null
}

// 切換釘選狀態
function togglePin() {
  detailPanel.pinned = !detailPanel.pinned
}

// 強制關閉（包含釘選狀態）
function forceClose() {
  detailPanel.show = false
  detailPanel.stock = null
  detailPanel.pinned = false
}

function onSizeChange(){
  document.documentElement.style.setProperty('--cell-size', `${state.cellSize}px`)
  const gap = Math.max(4, Math.round(state.cellSize * 0.12))
  document.documentElement.style.setProperty('--cell-gap', `${gap}px`)
}

</script>

<template>
  <div class="heatmap-wrapper">
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
        <button class="btn-primary" @click="showDetail({ symbol: 'TEST', name: '測試股票', return: 5.5 })" style="background: #f59e0b;">
          <i class="fas fa-bug"></i> 測試面板
        </button>
      </div>
    </div>

    <div class="heatmap-grid">
      <template v-if="filteredSorted.length">
        <div v-for="s in filteredSorted" :key="s.symbol"
             class="heatmap-cell" 
             :class="[
               getReturnCategory(Number(s.return)),
               { 'active': detailPanel.show && detailPanel.stock?.symbol === s.symbol }
             ]"
             @click="showDetail(s)">
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
  </div>

    <!-- 側邊詳情面板 -->
    <transition name="slide-panel">
      <div v-if="detailPanel.show && detailPanel.stock" class="detail-panel">
        <div class="panel-header">
          <div class="panel-title">
            <h3>{{ detailPanel.stock.symbol }}</h3>
            <span class="stock-name">{{ detailPanel.stock.name || '股票名稱' }}</span>
          </div>
          <div class="panel-actions">
            <button 
              class="pin-btn" 
              :class="{ 'pinned': detailPanel.pinned }"
              @click="togglePin"
              :title="detailPanel.pinned ? '取消釘選' : '釘選面板'">
              <i class="fas fa-thumbtack"></i>
            </button>
            <button class="close-btn" @click="forceClose" title="關閉">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div class="panel-body">
          <!-- 報酬率區塊 -->
          <div class="info-section return-section">
            <div class="section-label">報酬率</div>
            <div class="return-value" :class="getReturnCategory(Number(detailPanel.stock.return))">
              {{ Number(detailPanel.stock.return).toFixed(2) }}%
            </div>
            <div class="return-bar">
              <div 
                class="return-bar-fill" 
                :class="getReturnCategory(Number(detailPanel.stock.return))"
                :style="{ width: Math.min(Math.abs(Number(detailPanel.stock.return)) * 10, 100) + '%' }">
              </div>
            </div>
          </div>

          <!-- 統計資訊 -->
          <div class="info-section stats-grid-panel">
            <div class="stat-item">
              <div class="stat-label">成交量</div>
              <div class="stat-value">{{ detailPanel.stock.volume ? Number(detailPanel.stock.volume).toLocaleString() : 'N/A' }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">漲跌幅</div>
              <div class="stat-value" :class="Number(detailPanel.stock.return) >= 0 ? 'positive' : 'negative'">
                {{ Number(detailPanel.stock.return) >= 0 ? '+' : '' }}{{ Number(detailPanel.stock.return).toFixed(2) }}%
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-label">市場排名</div>
              <div class="stat-value">{{ filteredSorted.findIndex(s => s.symbol === detailPanel.stock.symbol) + 1 }} / {{ filteredSorted.length }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">分類</div>
              <div class="stat-value">
                <span class="category-badge" :class="getReturnCategory(Number(detailPanel.stock.return))">
                  {{ getCategoryLabel(Number(detailPanel.stock.return)) }}
                </span>
              </div>
            </div>
          </div>

          <!-- 技術指標 (模擬數據) -->
          <div class="info-section indicators">
            <div class="section-label">技術指標</div>
            <div class="indicator-list">
              <div class="indicator-item">
                <span class="indicator-name">MA20</span>
                <span class="indicator-signal positive">多頭</span>
              </div>
              <div class="indicator-item">
                <span class="indicator-name">RSI</span>
                <span class="indicator-signal neutral">中性</span>
              </div>
              <div class="indicator-item">
                <span class="indicator-name">MACD</span>
                <span class="indicator-signal positive">買進</span>
              </div>
            </div>
          </div>

          <!-- 快速操作 -->
          <div class="info-section actions">
            <button class="action-btn primary">
              <i class="fas fa-star"></i>
              加入自選
            </button>
            <button class="action-btn secondary">
              <i class="fas fa-chart-line"></i>
              查看詳情
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 遮罩層 -->
    <transition name="fade">
      <div v-if="detailPanel.show && !detailPanel.pinned" class="panel-overlay" @click="closeDetail"></div>
    </transition>
  </div>
</template>

<style scoped>
/* === Wrapper === */
.heatmap-wrapper {
  position: relative;
}

/* === 側邊詳情面板樣式 === */
.detail-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  height: 100vh;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(100, 200, 255, 0.3);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
  z-index: 10000;
  overflow-y: auto;
  scrollbar-width: thin;
}

.detail-panel::-webkit-scrollbar {
  width: 6px;
}

.detail-panel::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.detail-panel::-webkit-scrollbar-thumb {
  background: rgba(100, 200, 255, 0.3);
  border-radius: 3px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px;
  border-bottom: 1px solid rgba(100, 200, 255, 0.2);
  background: rgba(0, 0, 0, 0.2);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(10px);
}

.panel-title h3 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #fff;
  text-shadow: 0 0 20px rgba(100, 200, 255, 0.5);
}

.stock-name {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.7);
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.pin-btn, .close-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(100, 200, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(226, 232, 240, 0.8);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pin-btn:hover, .close-btn:hover {
  background: rgba(100, 200, 255, 0.15);
  border-color: rgba(100, 200, 255, 0.6);
  color: #fff;
  transform: scale(1.05);
}

.pin-btn.pinned {
  background: rgba(100, 200, 255, 0.2);
  border-color: rgba(100, 200, 255, 0.6);
  color: #64c8ff;
}

.panel-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.info-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(100, 200, 255, 0.15);
  border-radius: 12px;
  padding: 16px;
}

.section-label {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 12px;
  font-weight: 600;
}

.return-section {
  text-align: center;
}

.return-value {
  font-size: 3rem;
  font-weight: 700;
  margin: 12px 0;
  font-variant-numeric: tabular-nums;
}

.return-value.positive-high, .return-value.positive-mid {
  color: #4ade80;
  text-shadow: 0 0 20px rgba(74, 222, 128, 0.5);
}

.return-value.negative-high, .return-value.negative-mid {
  color: #f87171;
  text-shadow: 0 0 20px rgba(248, 113, 113, 0.5);
}

.return-value.neutral {
  color: #94a3b8;
}

.return-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 12px;
}

.return-bar-fill {
  height: 100%;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.return-bar-fill.positive-high, .return-bar-fill.positive-mid {
  background: linear-gradient(90deg, #4ade80, #22c55e);
}

.return-bar-fill.negative-high, .return-bar-fill.negative-mid {
  background: linear-gradient(90deg, #f87171, #ef4444);
}

.stats-grid-panel {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px;
}

.stat-item {
  text-align: center;
}

.stat-item .stat-label {
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.6);
  margin-bottom: 6px;
}

.stat-item .stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
}

.stat-item .stat-value.positive {
  color: #4ade80;
}

.stat-item .stat-value.negative {
  color: #f87171;
}

.category-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.category-badge.positive-high {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.4);
}

.category-badge.positive-mid {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.category-badge.negative-high {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.category-badge.negative-mid {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.category-badge.neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.4);
}

.indicator-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.indicator-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.indicator-name {
  font-weight: 600;
  color: rgba(226, 232, 240, 0.9);
}

.indicator-signal {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
}

.indicator-signal.positive {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.indicator-signal.negative {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
}

.indicator-signal.neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.action-btn.primary {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.9), rgba(63, 182, 255, 0.9));
  color: #fff;
  box-shadow: 0 4px 12px rgba(100, 200, 255, 0.3);
}

.action-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(100, 200, 255, 0.4);
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(226, 232, 240, 0.9);
  border: 1px solid rgba(100, 200, 255, 0.3);
}

.action-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(100, 200, 255, 0.5);
}

/* 遮罩層 */
.panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  backdrop-filter: blur(4px);
}

/* 動畫 */
.slide-panel-enter-active, .slide-panel-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-panel-enter-from {
  transform: translateX(100%);
}

.slide-panel-leave-to {
  transform: translateX(100%);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 選中的格子高亮 */
.heatmap-cell.active {
  outline: 3px solid rgba(100, 200, 255, 0.8);
  outline-offset: 2px;
  transform: scale(1.05);
  z-index: 10;
  box-shadow: 0 8px 24px rgba(100, 200, 255, 0.4);
}

.heatmap-cell {
  cursor: pointer;
  transition: all 0.2s;
}

.heatmap-cell:hover {
  transform: scale(1.05);
  z-index: 5;
}

/* === 響應式設計 === */

/* 手機版 (<640px) */
@media (max-width: 639px) {
  /* 側邊面板改為底部滑出 */
  .detail-panel {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 75vh;
    max-height: 75vh;
    border-left: none;
    border-top: 1px solid rgba(100, 200, 255, 0.3);
    border-radius: 20px 20px 0 0;
  }

  .slide-panel-enter-from, .slide-panel-leave-to {
    transform: translateY(100%);
  }

  .panel-header {
    padding: 20px 16px;
  }

  .panel-title h3 {
    font-size: 1.5rem;
  }

  .panel-body {
    padding: 16px;
    gap: 16px;
  }

  .return-value {
    font-size: 2.5rem;
  }

  .stats-grid-panel {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .actions {
    flex-direction: column;
  }

  .action-btn {
    min-height: 44px;
  }

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
