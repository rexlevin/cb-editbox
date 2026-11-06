<template>
    <aside class="file-tree">
        <header class="ft-head">
            <span class="ft-name" :title="rootTitle">{{ displayName || $t('workspace.sidebar') }}</span>
            <span class="ft-actions">
                <el-button link :title="$t('workspace.refresh')" @click="onRefresh">
                    <el-icon><Refresh /></el-icon>
                </el-button>
                <el-button link :title="$t('workspace.hideSidebar')" @click="hide">
                    <el-icon><Fold /></el-icon>
                </el-button>
            </span>
        </header>

        <div v-if="!workspace.meta" class="ft-state">
            <p>{{ $t('workspace.noWorkspace') }}</p>
            <el-button size="small" type="primary" @click="openFolder">{{ $t('workspace.openFolder') }}</el-button>
        </div>
        <div v-else-if="workspace.error" class="ft-state">
            <p>{{ $t('workspace.error') }}</p>
            <div class="ft-state-actions">
                <el-button size="small" @click="reselect">{{ $t('workspace.reselect') }}</el-button>
                <el-button size="small" @click="closeWorkspace">{{ $t('workspace.closeWorkspace') }}</el-button>
            </div>
        </div>
        <div v-else-if="workspace.index.scanning && workspace.files.length === 0" class="ft-state">
            <p>{{ $t('workspace.scanning') }}</p>
        </div>
        <div v-else-if="workspace.files.length === 0" class="ft-state">
            <p>{{ $t('workspace.empty') }}</p>
        </div>
        <div v-else class="ft-rows" :style="{ fontSize: workspace.explorerFontSize + 'px' }">
            <div v-for="row in rows" :key="row.key" class="ft-row"
                 :class="{ active: row.type === 'file' && row.path === activePath }"
                 :style="{ paddingLeft: (10 + row.depth * 14) + 'px' }"
                 @click="onRowClick(row)">
                <span v-if="row.type === 'dir'" class="ft-icon ft-dir-icon" :style="{ color: row.icon.color }">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" :d="row.expanded ? FOLDER_OPEN_PATH : FOLDER_CLOSED_PATH" />
                    </svg>
                </span>
                <span v-else class="ft-file-icon" :style="{ color: row.icon.color }">{{ row.icon.label }}</span>
                <span class="ft-label" :title="row.path">{{ row.name }}</span>
                <span v-if="row.type === 'file' && row.opened" class="ft-dot" :class="{ dirty: row.dirty }"></span>
            </div>
        </div>

        <footer class="ft-foot">
            <span v-if="workspace.index.scanning">{{ $t('workspace.scanning') }}</span>
            <span v-else-if="workspace.index.truncated">
                {{ $t('workspace.truncated', { count: workspace.index.fileCount }) }}
            </span>
            <span v-else>{{ $t('workspace.fileCount', { count: workspace.index.fileCount }) }}</span>
        </footer>
    </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { Fold, Refresh } from '@element-plus/icons-vue';
import { useEditorStore } from '@/stores/editor';
import { useWorkspaceStore } from '@/stores/workspace';
import { resolveFileIcon, resolveFolderIcon } from '@/utils/fileIcons';

const emit = defineEmits(['open']);
const editor = useEditorStore();
const workspace = useWorkspaceStore();

const expanded = ref(new Set());

const displayName = computed(() => (workspace.meta ? workspace.meta.name : ''));
const rootTitle = computed(() => (workspace.meta ? workspace.meta.root : ''));
const activePath = computed(() => editor.activeTab?.path || null);
const openedPaths = computed(() => new Set(editor.tabs.filter(t => t.path).map(t => t.path)));
const dirtyPaths = computed(() => new Set(editor.tabs.filter(t => t.path && t.dirty).map(t => t.path)));

watch(() => workspace.meta?.root, () => {
    expanded.value = new Set();
});

function sortNodes(a, b) {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
}

function buildTree(files) {
    const root = new Map();
    for (const file of files) {
        const parts = String(file.rel || '').split('/').filter(Boolean);
        if (parts.length === 0) continue;
        let level = root;
        for (let i = 0; i < parts.length - 1; i += 1) {
            const rel = parts.slice(0, i + 1).join('/');
            if (!level.has(rel)) {
                level.set(rel, { rel, name: parts[i], type: 'dir', children: new Map() });
            }
            level = level.get(rel).children;
        }
        level.set(file.rel, {
            rel: file.rel,
            name: parts[parts.length - 1],
            type: 'file',
            path: file.path,
            children: null
        });
    }
    const toArray = (map) => {
        const nodes = [];
        for (const node of map.values()) {
            if (node.type === 'dir') node.children = toArray(node.children);
            nodes.push(node);
        }
        return nodes.sort(sortNodes);
    };
    return toArray(root);
}

const FOLDER_CLOSED_PATH = 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z';
// Material Design 的 folder-open 路径：展开时显示打开的文件夹
const FOLDER_OPEN_PATH = 'M19,20H4C2.9,20 2,19.1 2,18V6C2,4.9 2.9,4 4,4H10L12,6H19C20.1,6 21,6.9 21,8H21L4,8V18L6.4,10H23.5L21.1,18.3C20.8,19.3 19.9,20 19,20Z';

const tree = computed(() => buildTree(workspace.files));

const rows = computed(() => {
    const out = [];
    const walk = (nodes, depth) => {
        for (const node of nodes) {
            const open = node.type === 'dir' && expanded.value.has(node.rel);
            out.push({
                key: node.type + ':' + node.rel,
                rel: node.rel,
                name: node.name,
                type: node.type,
                path: node.path,
                depth,
                expanded: open,
                opened: node.type === 'file' && openedPaths.value.has(node.path),
                dirty: node.type === 'file' && dirtyPaths.value.has(node.path),
                icon: node.type === 'file' ? resolveFileIcon(node.name) : resolveFolderIcon(node.name)
            });
            if (open) walk(node.children, depth + 1);
        }
    };
    walk(tree.value, 0);
    return out;
});

function onRowClick(row) {
    if (row.type === 'dir') {
        const next = new Set(expanded.value);
        if (next.has(row.rel)) next.delete(row.rel);
        else next.add(row.rel);
        expanded.value = next;
        return;
    }
    emit('open', row.path);
}

async function onRefresh() {
    workspace.refresh();
}

async function openFolder() {
    await workspace.openDialog();
}

function hide() {
    workspace.setSidebarVisible(false);
}

async function reselect() {
    await workspace.openDialog();
}

async function closeWorkspace() {
    await workspace.close();
}
</script>

<style scoped>
.file-tree {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--el-border-color);
    background: var(--el-fill-color-light);
    overflow: hidden;
}
.ft-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}
.ft-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ft-actions {
    flex: none;
    display: flex;
    align-items: center;
}
.ft-actions .el-button {
    margin-left: 2px;
    padding: 2px;
}
.ft-rows {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 0;
}
.ft-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 2em;
    padding-right: 8px;
    font-size: inherit;
    color: var(--el-text-color-regular);
    cursor: pointer;
    user-select: none;
}
.ft-row:hover {
    background: var(--el-fill-color);
}
.ft-row.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
}
.ft-icon {
    flex: none;
    font-size: 1.08em;
    color: var(--el-text-color-secondary);
}
.ft-dir-icon {
    display: flex;
    align-items: center;
    color: #90A4AE;
}
.ft-dir-icon svg {
    width: 1.15em;
    height: 1.15em;
}
.ft-file-icon {
    flex: none;
    width: 1.4em;
    text-align: center;
    font-size: 0.72em;
    font-weight: 700;
    letter-spacing: 0;
    font-family: var(--el-font-family);
    line-height: 1;
}
.ft-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ft-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1px solid var(--el-color-primary);
}
.ft-dot.dirty {
    background: var(--el-color-warning);
    border-color: var(--el-color-warning);
}
.ft-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-align: center;
}
.ft-state-actions {
    display: flex;
    gap: 8px;
}
.ft-foot {
    flex: none;
    height: 24px;
    line-height: 24px;
    padding: 0 12px;
    border-top: 1px solid var(--el-border-color-lighter);
    font-size: 11px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
