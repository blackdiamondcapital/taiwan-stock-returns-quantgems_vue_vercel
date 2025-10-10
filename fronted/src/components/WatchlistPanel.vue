<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { fetchWatchlist, addToWatchlist, removeFromWatchlist, fetchStockQuote } from '../services/api'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'update:visible', 'select-stock'])

const watchlist = ref([])
const loading = ref(false)
const searchQuery = ref('')

const localVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

async function loadWatchlist() {
  loading.value = true
  try {
    const symbols = await fetchWatchlist()
    const quotes = await Promise.all(symbols.map(async symbol => {
      const quote = await fetchStockQuote(symbol)
      return {
        symbol,
        name: `股票 ${symbol}`,
        price: quote?.close ?? 0,
        change: quote?.change ?? 0,
        changePercent: quote?.changePercent ?? 0,
        volume: quote?.volume ?? 0
      }
    }))
    watchlist.value = quotes
  } finally {
    loading.value = false
  }
}

async function removeStock(symbol) {
  await removeFromWatchlist(symbol)
  watchlist.value = watchlist.value.filter(s => s.symbol !== symbol)
}

function selectStock(stock) {
  emit('select-stock', stock)
  close()
}

function close() {
  localVisible.value = false
  emit('close')
}

const filteredWatchlist = computed(() => {
  if (!searchQuery.value) return watchlist.value
  const query = searchQuery.value.toLowerCase()
  return watchlist.value.filter(stock => 
    stock.symbol.toLowerCase().includes(query) ||
    stock.name.toLowerCase().includes(query)
  )
})

onMounted(() => {
  if (props.visible) {
    loadWatchlist()
  }
})

watch(() => props.visible, (val) => {
  if (val) {
    loadWatchlist()
  }
})
</script>

<template>
  <teleport to="body">
    <transition name="panel-fade">
      <div v-if="localVisible" class="panel-overlay" @click="close">
        <transition name="panel-slide">
          <div v-if="localVisible" class="watchlist-panel" @click.stop>
            <div class="panel-header">
              <div class="header-title">
                <i class="fas fa-star"></i>
                <span>我的自選股</span>
                <span class="count-badge">{{ watchlist.length }}</span>
              </div>
              <button class="close-btn" @click="close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            
            <div class="panel-search">
              <i class="fas fa-search"></i>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜尋股票代碼或名稱..."
                class="search-input"
              />
            </div>
            
            <div class="panel-content">
              <div v-if="loading" class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <span>載入中...</span>
              </div>
              
              <div v-else-if="watchlist.length === 0" class="empty-state">
                <i class="fas fa-star-o"></i>
                <p>還沒有自選股</p>
                <span>在排行榜中點擊「加入自選」開始關注吧</span>
              </div>
              
              <div v-else-if="filteredWatchlist.length === 0" class="empty-state">
                <i class="fas fa-search"></i>
                <p>未找到符合的股票</p>
              </div>
              
              <div v-else class="watchlist-grid">
                <article
                  v-for="stock in filteredWatchlist"
                  :key="stock.symbol"
                  class="watchlist-card"
                  @click="selectStock(stock)"
                >
                  <div class="card-header">
                    <div class="stock-info">
                      <div class="stock-symbol">{{ stock.symbol }}</div>
                      <div class="stock-name">{{ stock.name }}</div>
                    </div>
                    <button
                      class="remove-btn"
                      @click.stop="removeStock(stock.symbol)"
                      title="移除自选"
                    >
                      <i class="fas fa-star"></i>
                    </button>
                  </div>
                  
                  <div class="card-price">
                    <div class="price">{{ stock.price }}</div>
                    <div class="change" :class="stock.change >= 0 ? 'positive' : 'negative'">
                      <i class="fas" :class="stock.change >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                      {{ (stock.change >= 0 ? '+' : '') + stock.change.toFixed(2) }}
                      ({{ stock.changePercent.toFixed(2) }}%)
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.watchlist-panel {
  width: 800px;
  max-width: 95vw;
  max-height: 90vh;
  background: linear-gradient(135deg, rgba(12, 22, 44, 0.98), rgba(16, 12, 48, 0.98));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(100, 200, 255, 0.3);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid rgba(100, 200, 255, 0.2);
  background: rgba(15, 23, 42, 0.6);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
}

.header-title i {
  color: #FFD700;
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: rgba(100, 200, 255, 0.25);
  border: 1px solid rgba(100, 200, 255, 0.4);
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
}

.close-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(100, 200, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(226, 232, 240, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
  transform: rotate(90deg);
}

.panel-search {
  position: relative;
  padding: 20px 28px;
  border-bottom: 1px solid rgba(100, 200, 255, 0.15);
}

.panel-search i {
  position: absolute;
  left: 44px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(100, 200, 255, 0.5);
  font-size: 1rem;
}

.search-input {
  width: 100%;
  padding: 12px 16px 12px 40px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(100, 200, 255, 0.25);
  border-radius: 10px;
  color: #fff;
  font-size: 0.95rem;
  transition: all 0.3s ease;
}

.search-input::placeholder {
  color: rgba(226, 232, 240, 0.4);
}

.search-input:focus {
  outline: none;
  border-color: rgba(100, 200, 255, 0.5);
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 4px 16px rgba(100, 200, 255, 0.15);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 16px;
}

.loading-state i {
  font-size: 2.5rem;
  color: rgba(100, 200, 255, 0.6);
}

.loading-state span {
  font-size: 1rem;
  color: rgba(226, 232, 240, 0.6);
}

.empty-state i {
  font-size: 4rem;
  color: rgba(100, 200, 255, 0.3);
}

.empty-state p {
  font-size: 1.2rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.empty-state span {
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.4);
}

.watchlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.watchlist-card {
  padding: 20px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 200, 255, 0.2);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.watchlist-card:hover {
  background: rgba(15, 23, 42, 0.7);
  border-color: rgba(100, 200, 255, 0.4);
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(100, 200, 255, 0.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.stock-info {
  flex: 1;
}

.stock-symbol {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
  text-shadow: 0 0 12px rgba(100, 200, 255, 0.3);
  margin-bottom: 4px;
}

.stock-name {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.6);
}

.remove-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 215, 0, 0.3);
  background: rgba(255, 215, 0, 0.1);
  color: #FFD700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
  transform: scale(1.1);
}

.card-price {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.price {
  font-size: 1.8rem;
  font-weight: 700;
  color: #fff;
}

.change {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1rem;
  font-weight: 600;
}

.change.positive {
  color: #4ade80;
}

.change.negative {
  color: #f87171;
}

.change i {
  font-size: 0.9rem;
}

/* Scrollbar */
.panel-content::-webkit-scrollbar {
  width: 8px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(100, 200, 255, 0.3);
  border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 200, 255, 0.5);
}

/* Transitions */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.3s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-20px);
}

@media (max-width: 768px) {
  .watchlist-panel {
    width: 100%;
    height: 100%;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .watchlist-grid {
    grid-template-columns: 1fr;
  }
}
</style>
