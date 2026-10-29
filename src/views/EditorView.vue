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

        <StatusBar />
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '@/stores/editor';
import CodeEditor from '@/components/CodeEditor.vue';
import TabBar from '@/components/TabBar.vue';
import StatusBar from '@/components/StatusBar.vue';

const { t, locale } = useI18n();
const store = useEditorStore();
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

async function openDialog() {
    const paths = await window.editbox.openDialog();
    await store.openPaths(paths);
    focusActiveEditor();
}

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
        case 'language.set':
            activeEditorApi.value?.setLanguage(payload);
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
    else if (key === 'editorFontFamily') editors.forEach(e => e.setEditorFont(value, null));
    else if (key === 'editorFontSize') editors.forEach(e => e.setEditorFont(null, value));
    else if (key === 'tabFontFamily') document.documentElement.style.setProperty('--tab-font-family', value);
    else if (key === 'tabFontSize') document.documentElement.style.setProperty('--tab-font-size', value);
    else if (key === 'statusFontFamily') document.documentElement.style.setProperty('--status-font-family', value);
    else if (key === 'statusFontSize') document.documentElement.style.setProperty('--status-font-size', value);
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
        const mode = s.localeMode || localStorage.getItem('editbox-locale-mode') || 'system';
        locale.value = mode === 'system'
            ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US')
            : mode;
    } catch (e) { /* ignore */ }

    await store.restoreSession();
    store.bindExternalChanged();
    store.bindFileDeleted();
    window.editbox.onRequestClose(() => {
        store.confirmClose({ fromRequestClose: true });
    });
    window.editbox.onMenuAction(onMenuAction);
    window.editbox.onSettingApplied(onSettingApplied);
    focusActiveEditor();
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
.editor-area {
    flex: 1;
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
