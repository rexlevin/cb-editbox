<template>
    <div v-if="open" class="lp-overlay" @mousedown.self="close">
        <div class="lp-panel">
            <input
                ref="inputEl"
                v-model="query"
                class="lp-input"
                :placeholder="t('picker.placeholder')"
                spellcheck="false"
                autocomplete="off"
                @keydown="onInputKeydown"
            />
            <ul ref="listEl" class="lp-list">
                <li
                    v-for="(item, i) in filtered"
                    :key="item.key"
                    class="lp-item"
                    :class="{ active: i === activeIndex }"
                    @mousedown.prevent="choose(item)"
                    @mousemove="activeIndex = i"
                >
                    <span class="lp-label">{{ item.label }}</span>
                    <span v-if="item.name === current" class="lp-current">{{ t('picker.current') }}</span>
                </li>
                <li v-if="filtered.length === 0" class="lp-empty">{{ t('picker.noResult') }}</li>
            </ul>
        </div>
    </div>
</template>

<script setup>
/**
 * 语言模式快速选择面板（快捷键 Ctrl+K, M）
 *
 * 行为对齐 VSCode 的「更改语言模式」：
 * - Ctrl+K 先进入和弦等待（1.5s 内），再按 M（不按 Ctrl）打开面板；
 * - 面板内输入关键字过滤（匹配名称 / 别名 / 扩展名），↑↓ 移动，Enter 确认，Esc 取消。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { languages } from '@codemirror/language-data';

const props = defineProps({
    // 当前标签页的语言名（null 表示纯文本）
    current: { type: String, default: null }
});
const emit = defineEmits(['select', 'close']);

const { t } = useI18n();

const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const inputEl = ref(null);
const listEl = ref(null);

// 语言清单与编辑器手动切换共用同一份数据源，保证选中项一定能加载
const items = computed(() => {
    const list = languages.map((desc) => ({
        key: desc.name,
        name: desc.name,
        label: desc.name,
        search: [desc.name, ...(desc.alias || []), ...(desc.extensions || [])].join(' ').toLowerCase()
    }));
    list.sort((a, b) => a.label.localeCompare(b.label));
    return [
        {
            key: '__plain',
            name: null,
            label: t('status.plainText'),
            search: 'plain text txt 纯文本'
        },
        ...list
    ];
});

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return items.value;
    return items.value.filter(item => item.search.includes(q));
});

watch(query, () => { activeIndex.value = 0; });

watch(activeIndex, () => {
    nextTick(() => {
        const el = listEl.value && listEl.value.children[activeIndex.value];
        if (el) el.scrollIntoView({ block: 'nearest' });
    });
});

function openPicker() {
    if (open.value) return;
    query.value = '';
    activeIndex.value = 0;
    open.value = true;
    nextTick(() => {
        if (inputEl.value) inputEl.value.focus();
    });
}

function close() {
    if (!open.value) return;
    open.value = false;
    emit('close');
}

function choose(item) {
    if (!item) return;
    emit('select', item.name);
    close();
}

function onInputKeydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const total = filtered.value.length;
        if (!total) return;
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        activeIndex.value = (activeIndex.value + delta + total) % total;
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        choose(filtered.value[activeIndex.value]);
        return;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        close();
    }
}

// ---------------------------------------------------------------------------
// Ctrl+K, M 和弦（Electron 菜单 accelerator 不支持序列键，故在渲染进程监听）
// ---------------------------------------------------------------------------
let chordArmed = false;
let chordTimer = null;

function disarm() {
    chordArmed = false;
    if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
    }
}

function onWindowKeydown(e) {
    if (open.value) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!chordArmed) {
        if (ctrl && !e.altKey && !e.shiftKey && e.code === 'KeyK' && !e.repeat) {
            // 抢占 Ctrl+K（原本是 CodeMirror 的 deleteToLineEnd），进入和弦等待
            e.preventDefault();
            e.stopPropagation();
            chordArmed = true;
            chordTimer = setTimeout(disarm, 1500);
        }
        return;
    }
    if (e.key === 'Escape') {
        disarm();
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        disarm();
        openPicker();
        return;
    }
    // 其余按键视为无效和弦，原样放行
    disarm();
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown, true));
onBeforeUnmount(() => {
    disarm();
    window.removeEventListener('keydown', onWindowKeydown, true);
});
</script>

<style scoped>
.lp-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    background: rgba(0, 0, 0, 0.06);
}
.lp-panel {
    margin-top: 10vh;
    width: 460px;
    max-width: calc(100vw - 40px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--el-bg-color-overlay, #fff);
    border: 1px solid var(--el-border-color, #ddd);
    border-radius: 6px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
}
.lp-input {
    height: 34px;
    padding: 0 12px;
    font-family: inherit;
    font-size: 14px;
    color: var(--el-text-color-primary, inherit);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--el-border-color-lighter, #eee);
    outline: none;
}
.lp-list {
    max-height: 46vh;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    list-style: none;
}
.lp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    font-size: 13px;
    color: var(--el-text-color-primary, inherit);
    cursor: pointer;
}
.lp-item.active {
    background: var(--el-color-primary-light-9, rgba(64, 158, 255, 0.12));
}
.lp-current {
    font-size: 11px;
    color: var(--el-text-color-secondary, #909399);
}
.lp-empty {
    padding: 10px 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary, #909399);
}
</style>
