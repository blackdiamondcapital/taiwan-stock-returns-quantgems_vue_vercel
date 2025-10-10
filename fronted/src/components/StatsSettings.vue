<script setup>
import { ref } from 'vue'
import draggable from 'vuedraggable'
import { useStatsConfig } from '../composables/useStatsConfig'

const emit = defineEmits(['close'])

const { cardsConfig, groupLabels, toggleCardVisibility, resetToDefault, reorderCards } = useStatsConfig()

// 本地編輯副本
const localCards = ref([...cardsConfig.value])

// 依分組整理卡片
const cardsByGroup = ref({})
function updateCardsByGroup() {
  const groups = {}
  localCards.value.forEach(card => {
    if (!groups[card.group]) groups[card.group] = []
    groups[card.group].push(card)
  })
  // 排序每個分組內的卡片
  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => a.order - b.order)
  })
  cardsByGroup.value = groups
}
updateCardsByGroup()

// 切換卡片顯示
function toggleCard(cardId) {
  const card = localCards.value.find(c => c.id === cardId)
  if (card) {
    card.visible = !card.visible
    updateCardsByGroup()
  }
}

// 儲存設定
function saveSettings() {
  // 更新順序
  localCards.value.forEach((card, index) => {
    card.order = index + 1
  })
  reorderCards(localCards.value)
  emit('close')
}

// 重置為預設
function handleReset() {
  if (confirm('確定要重置為預設配置嗎？')) {
    resetToDefault()
    localCards.value = [...cardsConfig.value]
    updateCardsByGroup()
  }
}

// 取消編輯
function cancel() {
  emit('close')
}

// 拖曳結束時更新分組
function onDragEnd() {
  updateCardsByGroup()
}
</script>

<template>
  <div class="modal-backdrop" @click.self="cancel">
    <div class="modal-container stats-settings-modal">
      <div class="modal-header">
        <h2 class="modal-title">
          <i class="fas fa-cog"></i>
          自訂卡片顯示
        </h2>
        <button class="modal-close-btn" @click="cancel" title="關閉">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="modal-body">
        <div class="settings-info">
          <i class="fas fa-info-circle"></i>
          拖曳卡片可調整順序，點擊眼睛圖示可顯示/隱藏卡片
        </div>

        <!-- 依分組顯示卡片 -->
        <div v-for="(cards, groupKey) in cardsByGroup" :key="groupKey" class="settings-group">
          <div class="settings-group-header">
            <i class="fas fa-folder-open"></i>
            <span>{{ groupLabels[groupKey] }}</span>
            <span class="settings-group-count">{{ cards.length }} 張卡片</span>
          </div>

          <draggable
            v-model="localCards"
            class="settings-cards-list"
            item-key="id"
            :animation="200"
            @end="onDragEnd"
            handle=".drag-handle"
          >
            <template #item="{ element }">
              <div
                v-if="element.group === groupKey"
                class="settings-card-item"
                :class="{ 'is-hidden': !element.visible }"
              >
                <div class="drag-handle" title="拖曳排序">
                  <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="card-info">
                  <span class="card-label">{{ element.label }}</span>
                  <span class="card-id">{{ element.id }}</span>
                </div>
                <button
                  class="toggle-visibility-btn"
                  @click="toggleCard(element.id)"
                  :title="element.visible ? '隱藏卡片' : '顯示卡片'"
                >
                  <i class="fas" :class="element.visible ? 'fa-eye' : 'fa-eye-slash'"></i>
                </button>
              </div>
            </template>
          </draggable>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleReset">
          <i class="fas fa-undo"></i>
          重置為預設
        </button>
        <div class="footer-actions">
          <button class="btn btn-outline" @click="cancel">取消</button>
          <button class="btn btn-primary" @click="saveSettings">
            <i class="fas fa-save"></i>
            儲存設定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-container {
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 12px;
  max-width: 700px;
  width: 100%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary, #aaa);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.settings-info {
  background: rgba(0, 123, 255, 0.1);
  border: 1px solid rgba(0, 123, 255, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  color: #4dabf7;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
}

.settings-group {
  margin-bottom: 24px;
}

.settings-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

.settings-group-count {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--text-secondary, #aaa);
  font-weight: 400;
}

.settings-cards-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-card-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  transition: all 0.2s;
}

.settings-card-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.settings-card-item.is-hidden {
  opacity: 0.5;
}

.drag-handle {
  cursor: grab;
  color: var(--text-secondary, #aaa);
  font-size: 1.1rem;
  padding: 4px;
}

.drag-handle:active {
  cursor: grabbing;
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-label {
  font-weight: 500;
  color: var(--text-primary, #fff);
}

.card-id {
  font-size: 0.8rem;
  color: var(--text-secondary, #888);
  font-family: monospace;
}

.toggle-visibility-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary, #aaa);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s;
}

.toggle-visibility-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  gap: 12px;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-outline {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-primary, #fff);
}

.btn-outline:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.3);
}
</style>
