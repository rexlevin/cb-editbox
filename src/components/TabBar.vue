<template>
    <div ref="wrapRef" class="tabbar-wrap"
         @dragstart="onDragStart" @dragover="onDragOver" @drop="onDrop" @dragend="onDragEnd">
        <el-tabs
            :model-value="store.activeId"
            type="card"
            closable
            class="edit-tabs"
            @tab-change="(id) => { store.activeId = Number(id); store.persistSession(); }"
            @tab-remove="(id) => store.closeTab(Number(id))"
        >
            <el-tab-pane v-for="tab in store.tabs" :key="tab.id" :name="tab.id">
                <template #label>
                    <span class="tab-label" :title="tab.path || tab.name"
                          @contextmenu.prevent="openMenu($event, tab)">
                        <span v-if="tab.dirty" class="dirty-dot">● </span>{{ tab.name }}
                    </span>
                </template>
            </el-tab-pane>
        </el-tabs>

        <div v-if="menu.visible" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
            <div class="ctx-item" @click="act('reload')">{{ $t('ctx.reload') }}</div>
            <div class="ctx-item" @click="act('reveal')">{{ $t('ctx.revealInFolder') }}</div>
            <div class="ctx-sep"></div>
            <div class="ctx-item" @click="act('close')">{{ $t('ctx.closeTab') }}</div>
            <div class="ctx-item" @click="act('closeOthers')">{{ $t('ctx.closeOthers') }}</div>
            <div class="ctx-item" @click="act('closeAll')">{{ $t('ctx.closeAll') }}</div>
        </div>
    </div>
</template>

<script setup>
import { reactive, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useEditorStore } from '@/stores/editor';

const store = useEditorStore();
const menu = reactive({ visible: false, x: 0, y: 0, tabId: null });
const wrapRef = ref(null);
let dragFromIndex = -1;

function tabItems() {
    return wrapRef.value ? Array.from(wrapRef.value.querySelectorAll('.el-tabs__item')) : [];
}

// Element Plus 渲染的标签项没有 draggable，挂载与增删/排序后统一补上
function syncDraggableTabs() {
    tabItems().forEach((el) => { el.draggable = true; });
}

watch(
    () => store.tabs.map((tab) => tab.id),
    async () => {
        await nextTick();
        syncDraggableTabs();
    },
    { deep: true }
);

function tabItemFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    return target ? target.closest('.el-tabs__item') : null;
}

function onDragStart(event) {
    const item = tabItemFromEvent(event);
    if (!item) return;
    dragFromIndex = tabItems().indexOf(item);
    if (dragFromIndex === -1) return;
    event.dataTransfer.effectAllowed = 'move';
    // Firefox/Safari 必须设置数据才会真正开始拖拽
    event.dataTransfer.setData('text/plain', String(dragFromIndex));
    item.classList.add('tab-dragging');
}

function onDragOver(event) {
    if (dragFromIndex < 0) return;
    // 阻止默认行为以允许 drop
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function onDrop(event) {
    if (dragFromIndex < 0) return;
    event.preventDefault();
    const item = tabItemFromEvent(event);
    if (!item) {
        resetDrag();
        return;
    }
    const items = tabItems();
    const overIndex = items.indexOf(item);
    if (overIndex !== -1) {
        const rect = item.getBoundingClientRect();
        // 指针落在目标标签右半边时插到其后
        let targetIndex = overIndex + (event.clientX > rect.left + rect.width / 2 ? 1 : 0);
        if (targetIndex > dragFromIndex) targetIndex -= 1;
        const tab = store.tabs[dragFromIndex];
        if (tab && targetIndex !== dragFromIndex) store.moveTabTo(tab.id, targetIndex);
    }
    resetDrag();
}

function onDragEnd() {
    resetDrag();
}

function resetDrag() {
    dragFromIndex = -1;
    tabItems().forEach((el) => el.classList.remove('tab-dragging'));
}

function openMenu(e, tab) {
    menu.x = e.clientX;
    menu.y = e.clientY;
    menu.tabId = tab.id;
    menu.visible = true;
}

function closeMenu() {
    menu.visible = false;
}

async function act(kind) {
    closeMenu();
    const id = menu.tabId;
    if (kind === 'reload') await store.reloadTab(id);
    if (kind === 'reveal') {
        const tab = store.tabs.find(t => t.id === id);
        if (tab && tab.path) window.editbox.revealFile(tab.path);
    }
    if (kind === 'close') await store.closeTab(id);
    if (kind === 'closeOthers') await store.closeOthers(id);
    if (kind === 'closeAll') await store.confirmClose({ fromRequestClose: false });
}

onMounted(() => {
    document.addEventListener('click', closeMenu);
    syncDraggableTabs();
});
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));
</script>

<style scoped>
.tabbar-wrap {
    position: relative;
    flex: none;
}
.edit-tabs :deep(.el-tabs__header) {
    margin: 0;
    /* Element Plus 默认 height: var(--el-tabs-header-height)（40px），
       多行标签会溢出到编辑区；这里改为随标签行数自适应 */
    height: auto;
    align-items: flex-start;
    border-bottom: 1px solid var(--el-border-color);
    background: var(--el-fill-color-dark);
}
/* 标签多行展示：隐藏滚动箭头，标签按行换行 */
.edit-tabs :deep(.el-tabs__nav-wrap),
.edit-tabs :deep(.el-tabs__nav-scroll) {
    overflow: visible;
}
/* 标签溢出时 Element Plus 会给 nav-wrap 加 20px 内边距（为滚动箭头留位置），多行模式下取消 */
.edit-tabs :deep(.el-tabs__nav-wrap.is-scrollable) {
    padding: 0;
}
.edit-tabs :deep(.el-tabs__nav-next),
.edit-tabs :deep(.el-tabs__nav-prev) {
    display: none;
}
.edit-tabs :deep(.el-tabs__nav) {
    display: flex;
    flex-wrap: wrap;
    white-space: normal;
    float: none;
    transform: none !important;
    border: none;
}
.edit-tabs :deep(.el-tabs__item) {
    white-space: nowrap;
    height: 34px;
    line-height: 34px;
    font-family: var(--tab-font-family, inherit);
    font-size: var(--tab-font-size, 13px);
    font-weight: 600;
    background: var(--el-fill-color);
    border: 1px solid var(--el-border-color-light);
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    margin-right: 2px;
    color: var(--el-text-color-secondary);
    position: relative;
    transition: background 0.12s, color 0.12s;
}
.edit-tabs :deep(.el-tabs__item:hover) {
    color: var(--el-text-color-primary);
}
/* 选中标签：更亮背景，顶部主题色带（NotepadNext 风格）；文字常驻加粗 */
.edit-tabs :deep(.el-tabs__item.is-active) {
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    border-color: var(--el-border-color);
    border-bottom-color: var(--el-bg-color);
}
/* VSCode 风格：关闭 X 常驻占位，显隐只切透明度，tab 尺寸与文字位置保持不动 */
.edit-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item.is-closable),
.edit-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item.is-closable:hover),
.edit-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item.is-active.is-closable) {
    padding-left: 12px;
    padding-right: 12px;
}
.edit-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item .is-icon-close) {
    width: 14px;
    height: 14px;
    margin-left: 6px;
    right: 0;
    opacity: 0;
    pointer-events: none;
    transform: scale(0.85);
    transition: opacity 0.12s ease, transform 0.12s ease,
        background-color 0.12s ease, color 0.12s ease;
}
.edit-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item:hover .is-icon-close),
.edit-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item.is-active .is-icon-close) {
    width: 14px;
    opacity: 1;
    pointer-events: auto;
    transform: scale(1);
}
.edit-tabs :deep(.el-tabs__item.is-active::before) {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--el-color-primary);
    border-radius: 4px 4px 0 0;
}
/* 编辑区由 editor-area 承载，隐藏 el-tabs 空面板 */
.edit-tabs :deep(.el-tabs__content) {
    display: none;
}
/* 拖动排序中的标签视觉反馈 */
.edit-tabs :deep(.el-tabs__item.tab-dragging) {
    opacity: 0.55;
}
.dirty-dot {
    color: var(--el-color-warning);
}
.ctx-menu {
    position: fixed;
    z-index: 3000;
    min-width: 180px;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-light);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    padding: 4px 0;
}
.ctx-item {
    padding: 6px 16px;
    font-size: 16.25px;
    cursor: pointer;
    user-select: none;
}
.ctx-item:hover {
    background: var(--el-fill-color);
}
.ctx-sep {
    height: 1px;
    margin: 4px 0;
    background: var(--el-border-color-lighter);
}
</style>
