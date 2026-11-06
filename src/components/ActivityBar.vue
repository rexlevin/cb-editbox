<template>
    <nav class="activity-bar">
        <el-tooltip
            :content="`${$t('workspace.explorer')} (Ctrl+Shift+E)`"
            placement="right"
            :show-after="400"
        >
            <button
                class="ab-item"
                :class="{ active: explorerActive }"
                :aria-label="$t('workspace.explorer')"
                @click="toggleExplorer"
            >
                <el-icon><FolderOpened /></el-icon>
            </button>
        </el-tooltip>
    </nav>
</template>

<script setup>
import { computed } from 'vue';
import { FolderOpened } from '@element-plus/icons-vue';
import { useWorkspaceStore } from '@/stores/workspace';

const workspace = useWorkspaceStore();
const explorerActive = computed(() => Boolean(workspace.meta) && workspace.sidebarVisible);

async function toggleExplorer() {
    await workspace.setSidebarVisible(!workspace.sidebarVisible);
}
</script>

<style scoped>
.activity-bar {
    flex: 0 0 48px;
    min-width: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 0;
    gap: 4px;
    border-right: 1px solid var(--el-border-color);
    background: var(--el-fill-color-light);
}
.ab-item {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}
.ab-item:hover {
    color: var(--el-text-color-primary);
    background: var(--el-fill-color);
}
.ab-item.active {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
}
.ab-item.dimmed {
    opacity: 0.45;
}
.ab-item .el-icon {
    font-size: 20px;
}
</style>
