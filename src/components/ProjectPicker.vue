<template>
    <div v-if="visible" class="pp-mask" @mousedown.self="close">
        <div class="pp-panel">
            <div class="pp-search">
                <el-icon><Search /></el-icon>
                <input ref="inputRef" v-model="query" class="pp-input"
                       :placeholder="commandMode ? $t('project.commandPlaceholder') : $t('project.filterPlaceholder')"
                       @keydown="onKeydown" />
            </div>
            <ul v-if="filtered.length > 0" class="pp-list">
                <li v-for="(item, idx) in filtered" :key="item.action || item.root"
                    class="pp-item" :class="{ active: idx === activeIndex, missing: !item.exists }"
                    @mouseenter="activeIndex = idx" @click="choose(item)">
                    <div v-if="item.command" class="pp-main">
                        <span class="pp-cmd-icon">{{ item.icon }}</span>
                        <span class="pp-name">{{ item.name }}</span>
                    </div>
                    <div v-else class="pp-main">
                        <span class="pp-name">{{ item.name }}</span>
                        <span v-if="item.recent" class="pp-tag">{{ $t('project.recentTag') }}</span>
                        <span v-if="!item.exists" class="pp-missing">{{ $t('project.missing') }}</span>
                    </div>
                    <span v-if="!item.command" class="pp-path" :title="item.root">{{ item.root }}</span>
                </li>
            </ul>
            <div v-else class="pp-empty">{{ commandMode ? $t('project.noCommands') : $t('project.noProjects') }}</div>
            <footer class="pp-foot">{{ $t('project.pickerHint') }}</footer>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';
import i18n from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspace';

const props = defineProps({
    visible: { type: Boolean, default: false },
    // project=项目/最近工作区列表；command=命令列表（查询框以 > 开头时同样进入命令模式）
    mode: { type: String, default: 'project' }
});
const emit = defineEmits(['close', 'run']);

const workspace = useWorkspaceStore();
const inputRef = ref(null);
const query = ref('');
const activeIndex = ref(0);

// 内置命令：与原生菜单动作一一对应，统一由 EditorView 的 onMenuAction 执行
const COMMANDS = [
    { action: 'file.new', labelKey: 'act.new', icon: '+' },
    { action: 'file.open', labelKey: 'act.openFile', icon: 'O' },
    { action: 'workspace.openFolder', labelKey: 'act.openFolder', icon: 'D' },
    { action: 'file.save', labelKey: 'act.save', icon: 'S' },
    { action: 'workspace.saveProject', labelKey: 'act.saveProject', icon: 'P' },
    { action: 'workspace.openProject', labelKey: 'act.openProject', icon: 'R' },
    { action: 'workspace.close', labelKey: 'act.closeWorkspace', icon: 'X' },
    { action: 'view.sidebar', labelKey: 'act.toggleSidebar', icon: 'B', payload: true },
    { action: 'view.explorer', labelKey: 'act.showExplorer', icon: 'E' },
    { action: 'search.find', labelKey: 'act.find', icon: 'F' },
    { action: 'search.replace', labelKey: 'act.replace', icon: 'H' },
    { action: 'options.settings', labelKey: 'act.settings', icon: 'G' }
];

// 命令模式完全由查询前缀决定：输入 > 进入命令列表，删掉 > 回到项目/最近工作区
const commandMode = computed(() => query.value.trimStart().startsWith('>'));

const projectEntries = computed(() => {
    const saved = workspace.projects;
    const savedRoots = new Set(saved.map((item) => item.root));
    const recents = workspace.recents
        .filter((root) => !savedRoots.has(root))
        .map((root) => ({
            id: null,
            name: String(root).split('/').pop() || root,
            root,
            exists: true,
            recent: true
        }));
    return [...saved, ...recents];
});

const commandEntries = computed(() => COMMANDS.map((command) => ({
    key: command.action,
    command: true,
    action: command.action,
    payload: command.payload,
    icon: command.icon,
    name: i18n.global.t(command.labelKey)
})));

const filtered = computed(() => {
    const keyword = query.value.trim().toLowerCase();
    if (commandMode.value) {
        const commandKeyword = keyword.replace(/^>\s*/, '');
        if (!commandKeyword) return commandEntries.value;
        return commandEntries.value.filter((item) => item.name.toLowerCase().includes(commandKeyword));
    }
    if (!keyword) return projectEntries.value;
    return projectEntries.value.filter((item) => (
        String(item.name || '').toLowerCase().includes(keyword)
        || String(item.root || '').toLowerCase().includes(keyword)
    ));
});

watch(filtered, () => {
    if (activeIndex.value >= filtered.value.length) {
        activeIndex.value = Math.max(0, filtered.value.length - 1);
    }
});

watch(() => props.visible, async (visible) => {
    if (!visible) return;
    query.value = props.mode === 'command' ? '>' : '';
    activeIndex.value = 0;
    await workspace.loadProjects();
    await nextTick();
    if (inputRef.value) inputRef.value.focus();
});

function close() {
    emit('close');
}

function move(delta) {
    if (filtered.value.length === 0) return;
    activeIndex.value = (activeIndex.value + delta + filtered.value.length) % filtered.value.length;
}

async function choose(item) {
    if (item.command) {
        close();
        emit('run', item.action, item.payload);
        return;
    }
    let ret = null;
    try {
        ret = item.recent ? await workspace.open(item.root) : await workspace.openProject(item);
    } finally {
        // 工作区确实打开时立即关闭浮层，避免打开成功但切换上下文异常导致浮层残留
        if ((ret && ret.ok) || (item.root && workspace.meta && workspace.meta.root === item.root)) close();
    }
}

async function onKeydown(event) {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
    }
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
        return;
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        const item = filtered.value[activeIndex.value];
        if (item) await choose(item);
        return;
    }
    if (event.key === 'Delete') {
        event.preventDefault();
        if (commandMode.value) return;
        const item = filtered.value[activeIndex.value];
        if (!item) return;
        if (item.recent) await workspace.removeRecent(item.root);
        else await workspace.removeProject(item.id);
        return;
    }
    if (event.key === 'F2') {
        event.preventDefault();
        if (commandMode.value) return;
        const item = filtered.value[activeIndex.value];
        if (item && item.id) await workspace.renameProject(item.id);
    }
}
</script>

<style scoped>
.pp-mask {
    position: fixed;
    inset: 0;
    z-index: 2600;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    background: rgba(0, 0, 0, 0.12);
}
.pp-panel {
    width: 640px;
    max-width: calc(100vw - 48px);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
    overflow: hidden;
}
.pp-search {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-secondary);
}
.pp-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: var(--el-text-color-primary);
    font-family: inherit;
}
.pp-list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    overflow: auto;
}
.pp-item {
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
}
.pp-item.active {
    background: var(--el-fill-color);
}
.pp-item.missing {
    opacity: 0.6;
}
.pp-cmd-icon {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    text-align: center;
    font-size: 10px;
    line-height: 16px;
    font-weight: 700;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
}
.pp-main {
    display: flex;
    align-items: center;
    gap: 8px;
}
.pp-name {
    font-size: 13px;
    color: var(--el-text-color-primary);
}
.pp-tag {
    flex: none;
    padding: 0 5px;
    border-radius: 3px;
    font-size: 10px;
    line-height: 16px;
    color: var(--el-color-warning-dark-2);
    background: var(--el-color-warning-light-9);
}
.pp-missing {
    font-size: 11px;
    color: var(--el-color-danger);
}
.pp-path {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pp-empty {
    padding: 24px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    text-align: center;
}
.pp-foot {
    flex: none;
    padding: 6px 12px;
    border-top: 1px solid var(--el-border-color-lighter);
    font-size: 11px;
    color: var(--el-text-color-secondary);
}
</style>
