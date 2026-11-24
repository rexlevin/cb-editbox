<template>
    <div v-if="open" class="qp-mask" @mousedown.self="close">
        <div class="qp-panel">
            <div class="qp-search">
                <el-icon><Search /></el-icon>
                <input
                    ref="inputEl"
                    v-model="query"
                    class="qp-input"
                    :placeholder="t('picker.placeholder')"
                    spellcheck="false"
                    autocomplete="off"
                    @keydown="onInputKeydown"
                />
            </div>
            <ul ref="listEl" class="qp-list">
                <li
                    v-for="(item, i) in filtered"
                    :key="item.key"
                    class="qp-item lp-item"
                    :class="{ active: i === activeIndex }"
                    @mousedown.prevent="choose(item)"
                    @mouseenter="activeIndex = i"
                >
                    <span class="lp-label">{{ item.label }}</span>
                    <span v-if="item.name === current" class="lp-current">{{ t('picker.current') }}</span>
                </li>
                <li v-if="filtered.length === 0" class="qp-empty">{{ t('picker.noResult') }}</li>
            </ul>
            <footer class="qp-foot">{{ t('picker.hint') }}</footer>
        </div>
    </div>
</template>

<script setup>
/**
 * 语言模式快速选择面板（快捷键 Ctrl+K, M / Ctrl+K, O）
 *
 * 行为对齐 VSCode 的「更改语言模式」：
 * - Ctrl+K 先进入和弦等待（1.5s 内），再按 M（不按 Ctrl）打开面板；
 * - 同一和弦前缀下按 O 切换 Markdown 大纲（仅 Markdown 文档生效）；
 * - 面板内输入关键字过滤（匹配名称 / 别名 / 扩展名），↑↓ 移动，Enter 确认，Esc 取消。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search } from '@element-plus/icons-vue';
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

// 模糊匹配：查询字符按顺序出现即可命中（如 mkdown 命中 markdown），并返回匹配分数用于排序
// 返回 null 表示不匹配；分数越高越靠前
function fuzzyScore(search, q) {
    const exact = search.indexOf(q);
    if (exact !== -1) {
        // 连续子串命中优先，且越靠前越好
        return 1000 - exact + (search.startsWith(q) ? 500 : 0);
    }
    let from = 0;
    let score = 0;
    let streak = 0;
    for (const ch of q) {
        const found = search.indexOf(ch, from);
        if (found === -1) return null;
        if (found === from) {
            // 与上一个命中相邻，连续命中加分
            streak += 1;
            score += 10 + streak * 5;
        } else {
            streak = 0;
            score += Math.max(1, 6 - (found - from));
        }
        from = found + 1;
    }
    return score;
}

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return items.value;
    const matches = [];
    for (const item of items.value) {
        const score = fuzzyScore(item.search, q);
        if (score !== null) matches.push({ item, score });
    }
    // 同分时保持原有字母序（Array.prototype.sort 稳定）
    matches.sort((a, b) => b.score - a.score);
    return matches.map(m => m.item);
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
// Ctrl+K, M / Ctrl+K, O 和弦（Electron 菜单 accelerator 不支持序列键，故在渲染进程监听）
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

// Ctrl+K, O：切换 Markdown 大纲。设置项是全局的，写入后由主进程广播给所有编辑器
async function toggleOutline() {
    if (props.current !== 'Markdown') return;
    try {
        const s = await window.editbox.settingsGetAll();
        // showOutline 默认开：当前为 false 时表示折叠，下一次应展开
        window.editbox.settingsSet('showOutline', s.showOutline === false);
    } catch (e) { /* 持久化失败不阻断切换 */ }
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
    if (e.code === 'KeyO' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        disarm();
        toggleOutline();
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
.lp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 15px;
    color: var(--el-text-color-primary, inherit);
}
.lp-label {
    min-width: 0;
}
.lp-current {
    flex: none;
    font-size: 12px;
    color: var(--el-text-color-secondary, #909399);
}
</style>
