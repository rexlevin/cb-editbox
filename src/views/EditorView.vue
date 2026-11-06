<template>
    <div class="editor-view" @dragover.prevent @drop.prevent="onDrop">
        <el-alert
            v-if="conflictTab"
            type="warning"
            :closable="false"
            class="conflict-alert"
        >
            <span>{{ $t('msg.externalConflict', { name: conflictTab.name }) }}</span>
            <el-button size="small" type="warning" plain class="alert-btn"
                       @click="store.resolveExternalConflict(conflictTab.id, 'reload')">
                {{ $t('btn.reloadDiscard') }}
            </el-button>
            <el-button size="small" plain class="alert-btn"
                       @click="store.resolveExternalConflict(conflictTab.id, 'keep')">
                {{ $t('btn.ignore') }}
            </el-button>
        </el-alert>

        <div class="work-area">
            <ActivityBar />
            <div v-if="workspace.sidebarVisible" class="sidebar-panel"
                 :style="{ width: workspace.sidebarWidth + 'px' }">
                <FileTree @open="onTreeOpen" />
                <div class="sidebar-resizer" @mousedown="startSidebarResize"></div>
            </div>
            <div class="main-col">
                <TabBar />
                <main class="editor-area">
                    <template v-for="tab in store.tabs" :key="tab.id">
                        <div v-show="tab.id === store.activeId" class="editor-pane">
                            <CodeEditor :ref="(el) => setEditorRef(tab.id, el)" :tab="tab" />
                        </div>
                    </template>
                    <div v-if="store.tabs.length === 0" class="empty-hint">
                        <p>{{ $t('empty.hint') }}</p>
                        <p class="empty-sub">{{ $t('empty.sub') }}</p>
                    </div>
                </main>
            </div>
        </div>

        <StatusBar />

        <LanguagePicker
            :current="activeLanguage"
            @select="onPickLanguage"
            @close="focusActiveEditor"
        />

        <ProjectPicker :visible="projectPickerVisible" :mode="projectPickerMode"
                       @close="projectPickerVisible = false" @run="onPickerRun" />
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '@/stores/editor';
import { useWorkspaceStore } from '@/stores/workspace';
import CodeEditor from '@/components/CodeEditor.vue';
import TabBar from '@/components/TabBar.vue';
import StatusBar from '@/components/StatusBar.vue';
import LanguagePicker from '@/components/LanguagePicker.vue';
import FileTree from '@/components/FileTree.vue';
import ActivityBar from '@/components/ActivityBar.vue';
import ProjectPicker from '@/components/ProjectPicker.vue';

const { t, locale } = useI18n();
const store = useEditorStore();
const workspace = useWorkspaceStore();
const projectPickerVisible = ref(false);
const projectPickerMode = ref('project');
const appVersion = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : '';
const conflictTab = computed(() => store.tabs.find(tab => tab.externalConflict) || null);

// 每个 tab 对应一个 CodeEditor 实例（v-show 保活），用 id 索引
const editorRefs = ref({});
function setEditorRef(id, el) {
    if (el) editorRefs.value[id] = el;
    else delete editorRefs.value[id];
}
const activeEditorApi = computed(() => {
    const id = store.activeId;
    return id !== null ? editorRefs.value[id] : null;
});

function focusActiveEditor() {
    const api = activeEditorApi.value;
    if (api) nextTick(() => api.focusEditor());
}

// 语言快速选择：当前标签页语言 + 选中后立即生效
const activeLanguage = computed(() => store.activeTab?.language ?? null);
function onPickLanguage(name) {
    activeEditorApi.value?.setLanguage(name);
}

async function openDialog() {
    const paths = await window.editbox.openDialog();
    await store.openPaths(paths);
    focusActiveEditor();
}

async function onTreeOpen(path) {
    await store.openPaths([path]);
    focusActiveEditor();
}

function updateTitle() {
    const name = workspace.meta ? workspace.meta.name : '';
    document.title = name ? `EditBox - ${name} - v${appVersion}` : `EditBox - v${appVersion}`;
}

watch(() => workspace.meta, updateTitle);

async function onDrop(e) {
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files.map(f => window.editbox.pathForFile(f)).filter(Boolean);
    await store.openPaths(paths);
    focusActiveEditor();
}

// 原生菜单动作分发
async function onMenuAction(action, payload) {
    switch (action) {
        case 'file.new': {
            store.newTab();
            focusActiveEditor();
            break;
        }
        case 'file.open': {
            await openDialog();
            break;
        }
        case 'file.openRecent': {
            const opened = await store.openPaths([payload]);
            if (!opened.includes(payload)) await window.editbox.recentRemove(payload);
            focusActiveEditor();
            break;
        }
        case 'file.save':
            if (store.activeId !== null) await store.saveTab(store.activeId);
            break;
        case 'file.saveAs':
            if (store.activeId !== null) await store.saveTabAs(store.activeId);
            break;
        case 'file.reload':
            if (store.activeId !== null) await store.reloadTab(store.activeId);
            break;
        case 'file.close':
            if (store.activeId !== null) await store.closeTab(store.activeId);
            focusActiveEditor();
            break;
        case 'file.closeOthers':
            if (store.activeId !== null) await store.closeOthers(store.activeId);
            break;
        case 'file.closeAll':
            await store.closeAll();
            break;
        case 'file.exit':
            await store.confirmClose({ fromRequestClose: true });
            break;
        case 'edit.undo':
            activeEditorApi.value?.undoCmd();
            break;
        case 'edit.redo':
            activeEditorApi.value?.redoCmd();
            break;
        case 'edit.cut':
            activeEditorApi.value?.cutCmd();
            break;
        case 'edit.copy':
            activeEditorApi.value?.copyCmd();
            break;
        case 'edit.paste':
            activeEditorApi.value?.pasteCmd();
            break;
        case 'edit.selectAll':
            activeEditorApi.value?.selectAllCmd();
            break;
        case 'edit.spacesToTabs':
            activeEditorApi.value?.spacesToTabs();
            break;
        case 'edit.tabsToSpaces':
            activeEditorApi.value?.tabsToSpaces();
            break;
        case 'search.find':
            activeEditorApi.value?.openFind();
            break;
        case 'search.replace':
            activeEditorApi.value?.openReplace();
            break;
        case 'view.zoomIn':
            await store.setZoom(store.zoomFactor + 0.1);
            break;
        case 'view.zoomOut':
            await store.setZoom(store.zoomFactor - 0.1);
            break;
        case 'view.zoomReset':
            await store.setZoom(1);
            break;
        case 'view.wordWrap':
            activeEditorApi.value?.setWordWrap(payload);
            break;
        case 'view.lineNumbers':
            activeEditorApi.value?.setLineNumbers(payload);
            break;
        case 'view.showWhitespace':
            activeEditorApi.value?.setShowWhitespace(payload);
            break;
        case 'view.showEol':
            activeEditorApi.value?.setShowEol(payload);
            break;
        case 'view.showMinimap':
            // 缩略图是全局设置：菜单切换后同步到所有已打开的编辑器
            Object.values(editorRefs.value).forEach(e => e.setShowMinimap(payload));
            break;
        case 'view.markdownPreview':
            // Markdown 实时渲染是全局设置：同步到所有已打开的编辑器
            Object.values(editorRefs.value).forEach(e => e.setMarkdownPreview(payload));
            break;
        case 'language.set':
            activeEditorApi.value?.setLanguage(payload);
            break;
        case 'workspace.openFolder':
            await workspace.openDialog();
            focusActiveEditor();
            break;
        case 'workspace.openRecent':
            if (payload) await workspace.open(payload);
            focusActiveEditor();
            break;
        case 'workspace.close':
            await workspace.close();
            focusActiveEditor();
            break;
        case 'workspace.refresh':
            await workspace.refresh();
            break;
        case 'workspace.saveProject':
            await workspace.saveCurrentAsProject();
            break;
        case 'workspace.openProject':
            projectPickerMode.value = 'project';
            projectPickerVisible.value = true;
            break;
        case 'view.sidebar':
            await workspace.setSidebarVisible(payload);
            break;
        case 'view.explorer':
            await workspace.setSidebarVisible(!workspace.sidebarVisible);
            break;
        case 'options.settings':
            window.editbox.openSettings();
            break;
        case 'help.about': {
            const v = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : '0.0.1';
            ElMessageBox.alert(t('about.body', { version: v }), t('about.title'), {
                confirmButtonText: t('btn.ok')
            }).catch(() => {});
            break;
        }
    }
}

// 设置窗口改动 → 应用到所有编辑器 / 界面
function onSettingApplied(key, value) {
    const editors = Object.values(editorRefs.value);
    if (key === 'wordWrap') editors.forEach(e => e.setWordWrap(value));
    else if (key === 'lineNumbers') editors.forEach(e => e.setLineNumbers(value));
    else if (key === 'tabSize') editors.forEach(e => e.setTabSize(value));
    else if (key === 'showWhitespace') editors.forEach(e => e.setShowWhitespace(value));
    else if (key === 'showEol') editors.forEach(e => e.setShowEol(value));
    else if (key === 'showMinimap') editors.forEach(e => e.setShowMinimap(value));
    else if (key === 'showOutline') editors.forEach(e => e.setShowOutline(value));
    else if (key === 'markdownLivePreview') editors.forEach(e => e.setMarkdownPreview(value));
    else if (key === 'editorFontFamily') editors.forEach(e => e.setEditorFont(value, null));
    else if (key === 'editorFontSize') editors.forEach(e => e.setEditorFont(null, value));
    else if (key === 'tabFontFamily') document.documentElement.style.setProperty('--tab-font-family', value);
    else if (key === 'tabFontSize') document.documentElement.style.setProperty('--tab-font-size', value);
    else if (key === 'statusFontFamily') document.documentElement.style.setProperty('--status-font-family', value);
    else if (key === 'statusFontSize') document.documentElement.style.setProperty('--status-font-size', value);
    else if (key === 'explorerFontSize') workspace.explorerFontSize = parseInt(value) || 13;
    else if (key === 'localeMode') {
        locale.value = value === 'system'
            ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US')
            : value;
    }
    else if (key === 'theme') applyTheme(value);
}

function isDarkTheme(theme) {
    return theme === 'dark'
        || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme(theme) {
    const dark = isDarkTheme(theme);
    document.documentElement.classList.toggle('dark', dark);
    Object.values(editorRefs.value).forEach(e => e.setAppTheme(dark));
}

// 系统主题变化时重新判定（主题为"跟随系统"）
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
        try {
            const s = await window.editbox.settingsGetAll();
            if (s.theme === 'system' || !s.theme) applyTheme('system');
        } catch (e) { /* ignore */ }
    });
}

watch(() => store.activeId, () => {
    focusActiveEditor();
});

// ---------------------------------------------------------------------------
// 主侧栏宽度拖拽（180–600px，松开后持久化）
// ---------------------------------------------------------------------------
let sidebarResize = null;

function onSidebarResizing(event) {
    if (!sidebarResize) return;
    const width = sidebarResize.startWidth + event.clientX - sidebarResize.startX;
    workspace.sidebarWidth = Math.min(600, Math.max(180, width));
}

function stopSidebarResize() {
    document.removeEventListener('mousemove', onSidebarResizing);
    document.removeEventListener('mouseup', stopSidebarResize);
    document.body.style.cursor = '';
    if (sidebarResize) window.editbox.settingsSet('sidebarWidth', workspace.sidebarWidth);
    sidebarResize = null;
}

function startSidebarResize(event) {
    sidebarResize = { startX: event.clientX, startWidth: workspace.sidebarWidth };
    document.addEventListener('mousemove', onSidebarResizing);
    document.addEventListener('mouseup', stopSidebarResize);
    document.body.style.cursor = 'col-resize';
    event.preventDefault();
}

// ---------------------------------------------------------------------------
// 快捷键：Ctrl+Shift+P 打开命令面板；Ctrl+K 和弦（第二个键不再按 Ctrl）
// 注：Ctrl+P（快速打开文件 + > / : / @ 前缀模式）由 docs/cb-editbox-quick-open-design.md
// 单独实现，此处不接管 Ctrl+P
// ---------------------------------------------------------------------------
let chordArmed = false;
let chordTimer = null;

function resetChord() {
    chordArmed = false;
    if (chordTimer) clearTimeout(chordTimer);
    chordTimer = null;
}

function openPicker(mode) {
    projectPickerMode.value = mode;
    projectPickerVisible.value = true;
}

function onGlobalKeydown(event) {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    // Ctrl+Shift+P：命令面板，等价于快速打开框输入 >
    if (mod && event.shiftKey && !event.altKey && key === 'p') {
        event.preventDefault();
        resetChord();
        openPicker('command');
        return;
    }
    if (!chordArmed) {
        if (mod && !event.altKey && !event.shiftKey && key === 'k' && !event.repeat) {
            event.preventDefault();
            chordArmed = true;
            chordTimer = setTimeout(resetChord, 1500);
        }
        return;
    }
    resetChord();
    if (event.altKey || event.shiftKey) return;
    // Ctrl+K 之后按 F（不带修饰键）：关闭工作区；M / O 由 LanguagePicker 处理
    if (key === 'f') {
        event.preventDefault();
        workspace.close();
    }
}

async function onPickerRun(action, payload) {
    projectPickerVisible.value = false;
    await onMenuAction(action, payload);
}

onMounted(async () => {
    // 应用已保存的 UI 设置
    try {
        const s = await window.editbox.settingsGetAll();
        if (s.theme) applyTheme(s.theme);
        const root = document.documentElement.style;
        if (s.tabFontFamily) root.setProperty('--tab-font-family', s.tabFontFamily);
        if (s.tabFontSize) root.setProperty('--tab-font-size', s.tabFontSize);
        if (s.statusFontFamily) root.setProperty('--status-font-family', s.statusFontFamily);
        if (s.statusFontSize) root.setProperty('--status-font-size', s.statusFontSize);
        if (s.explorerFontSize) workspace.explorerFontSize = parseInt(s.explorerFontSize) || 13;
        const mode = s.localeMode || localStorage.getItem('editbox-locale-mode') || 'system';
        locale.value = mode === 'system'
            ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US')
            : mode;
    } catch (e) { /* ignore */ }

    workspace.bindEvents();
    // 先注册窗口关闭与菜单事件，再做会话恢复：恢复过程出错也不能让窗口无法关闭
    window.editbox.onRequestClose(() => {
        store.confirmClose({ fromRequestClose: true });
    });
    window.editbox.onMenuAction(onMenuAction);
    window.editbox.onSettingApplied(onSettingApplied);
    window.addEventListener('keydown', onGlobalKeydown, true);
    try {
        await workspace.hydrate();
        await store.restoreSession();
        await workspace.restoreWorkspace();
    } catch (error) {
        console.error('[cb-editbox] 启动恢复失败:', error.message);
    }
    store.bindExternalChanged();
    store.bindFileDeleted();
    updateTitle();
    focusActiveEditor();
});

onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown, true);
    if (chordTimer) clearTimeout(chordTimer);
    stopSidebarResize();
});
</script>

<style scoped>
.editor-view {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.conflict-alert {
    flex: none;
    border-radius: 0;
}
.alert-btn {
    margin-left: 8px;
}
.work-area {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
}
.sidebar-panel {
    position: relative;
    flex: none;
    min-width: 180px;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.sidebar-resizer {
    position: absolute;
    top: 0;
    right: 0;
    width: 5px;
    height: 100%;
    cursor: col-resize;
    z-index: 2;
}
.sidebar-resizer:hover {
    background: var(--el-color-primary-light-7);
}
.main-col {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.editor-area {
    flex: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
}
.editor-pane {
    flex: 1;
    min-height: 0;
}
.empty-hint {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-secondary);
    user-select: none;
    font-size: 14px;
}
.empty-sub {
    font-size: 12px;
}
</style>
