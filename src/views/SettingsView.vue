<template>
    <div class="settings-window">
        <aside class="side-nav">
            <div class="nav-title">EditBox</div>
            <ul>
                <li v-for="c in categories" :key="c.key"
                    :class="{ active: active === c.key }"
                    @click="active = c.key">
                    <el-icon><component :is="c.icon" /></el-icon>
                    <span>{{ c.label }}</span>
                </li>
            </ul>
        </aside>

        <section class="content">
            <!-- 用户界面 -->
            <div v-if="active === 'ui'" class="pane">
                <h2>{{ t('settings.catUi') }}</h2>

                <div class="row">
                    <label>{{ t('settings.language') }}</label>
                    <el-select :model-value="localeMode" @change="changeLocale" style="width:200px">
                        <el-option value="system" :label="t('settings.langSystem')" />
                        <el-option value="zh-CN" :label="t('settings.langZh')" />
                        <el-option value="en-US" :label="t('settings.langEn')" />
                    </el-select>
                </div>

                <div class="row">
                    <label>{{ t('settings.theme') }}</label>
                    <el-radio-group :model-value="theme" @change="onTheme">
                        <el-radio value="light">{{ t('settings.themeLight') }}</el-radio>
                        <el-radio value="dark">{{ t('settings.themeDark') }}</el-radio>
                        <el-radio value="system">{{ t('settings.themeSystem') }}</el-radio>
                    </el-radio-group>
                </div>

                <div class="row">
                    <label>{{ t('settings.zoomLevel') }}</label>
                    <div class="zoom-row">
                        <el-slider :model-value="Math.round(zoomLevel * 100)" :min="50" :max="200" :step="10"
                                   style="width:240px" @change="onZoomChange" />
                        <span class="zoom-val">{{ Math.round(zoomLevel * 100) }}%</span>
                    </div>
                </div>

                <div class="row">
                    <label>{{ t('settings.tabSize') }}</label>
                    <el-radio-group :model-value="tabSize" @change="onTabSize">
                        <el-radio :value="2">2</el-radio>
                        <el-radio :value="4">4</el-radio>
                        <el-radio :value="8">8</el-radio>
                    </el-radio-group>
                </div>

                <div class="row">
                    <label>{{ t('settings.markdownPreview') }}</label>
                    <el-switch :model-value="markdownLivePreview" @change="onMarkdownPreview" />
                    <span class="desc-inline">{{ t('settings.markdownPreviewDesc') }}</span>
                </div>
            </div>

            <!-- 字体 -->
            <div v-if="active === 'font'" class="pane">
                <h2>{{ t('settings.catFont') }}</h2>

                <div class="row">
                    <label>{{ t('settings.tabFont') }}</label>
                    <el-select-v2
                        :model-value="tabFontFamily"
                        :options="fontSelectOptions"
                        filterable allow-create default-first-option
                        :placeholder="t('settings.fontPlaceholder')"
                        style="width:300px"
                        @change="onTabFont"
                    />
                </div>
                <div class="row">
                    <label>{{ t('settings.tabFontSize') }}</label>
                    <el-input-number :model-value="tabFontSizeNum" :min="10" :max="20" :step="1"
                                     @change="onTabFontSize" />
                    <span class="unit">px</span>
                </div>

                <div class="row">
                    <label>{{ t('settings.statusFont') }}</label>
                    <el-select-v2
                        :model-value="statusFontFamily"
                        :options="fontSelectOptions"
                        filterable allow-create default-first-option
                        :placeholder="t('settings.fontPlaceholder')"
                        style="width:300px"
                        @change="onStatusFont"
                    />
                </div>
                <div class="row">
                    <label>{{ t('settings.statusFontSize') }}</label>
                    <el-input-number :model-value="statusFontSizeNum" :min="10" :max="20" :step="1"
                                     @change="onStatusFontSize" />
                    <span class="unit">px</span>
                </div>

                <div class="row">
                    <label>{{ t('settings.editorFont') }}</label>
                    <el-select-v2
                        :model-value="editorFontFamily"
                        :options="fontSelectOptions"
                        filterable allow-create default-first-option
                        :placeholder="t('settings.fontPlaceholder')"
                        style="width:300px"
                        @change="onEditorFont"
                    />
                </div>
                <div class="row">
                    <label>{{ t('settings.editorFontSize') }}</label>
                    <el-input-number :model-value="editorFontSizeNum" :min="10" :max="36" :step="1"
                                     @change="onEditorFontSize" />
                    <span class="unit">px</span>
                </div>

                <div class="row">
                    <label>{{ t('settings.uiFontSize') }}</label>
                    <el-input-number :model-value="uiFontSizeNum" :min="10" :max="20" :step="1"
                                     @change="onUiFontSize" />
                    <span class="unit">px</span>
                </div>
            </div>

            <!-- 快捷键 -->
            <div v-if="active === 'shortcuts'" class="pane">
                <h2>{{ t('settings.catShortcuts') }}</h2>
                <p class="desc">{{ t('settings.shortcutsDesc') }}</p>
                <table class="shortcut-table">
                    <thead>
                        <tr><th>{{ t('settings.colKeys') }}</th><th>{{ t('settings.colAction') }}</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in shortcuts" :key="item.key">
                            <td><span class="kbd-list"><kbd v-for="k in item.keys" :key="k">{{ k }}</kbd></span></td>
                            <td>{{ t(item.label) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 关于 -->
            <div v-if="active === 'about'" class="pane about">
                <h2>{{ t('settings.catAbout') }}</h2>
                <div class="logo-box">
                    <img :src="logoUrl" alt="EditBox" />
                </div>
                <p class="app-name">EditBox</p>
                <p class="version">v{{ version }}</p>
                <p class="desc">{{ t('settings.aboutDesc') }}</p>
                <p class="tech">CodeMirror 6 · Vue 3 · Element Plus · Electron</p>
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Monitor, EditPen, Key, InfoFilled } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import logoUrl from '../../logo.png';

const { t, locale } = useI18n();

const version = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : '0.0.1';

const categories = computed(() => [
    { key: 'ui', label: t('settings.catUi'), icon: Monitor },
    { key: 'font', label: t('settings.catFont'), icon: EditPen },
    { key: 'shortcuts', label: t('settings.catShortcuts'), icon: Key },
    { key: 'about', label: t('settings.catAbout'), icon: InfoFilled }
]);

const active = ref('ui');

// 设置状态（本地 ref 必须随操作回写，控件显示才会更新）
const localeMode = ref('system');
const theme = ref('light');
const zoomLevel = ref(1);
const tabSize = ref(4);
const markdownLivePreview = ref(true);
const tabFontFamily = ref('');
const tabFontSize = ref(13);
const statusFontFamily = ref('');
const statusFontSize = ref(13);
const editorFontFamily = ref('');
const editorFontSize = ref(15);
const uiFontSize = ref(13);
const fontOptions = ref([]);
// el-select-v2 需要 {value,label} 结构，并做虚拟滚动（系统字体可达数千项）
const fontSelectOptions = computed(() => fontOptions.value.map((f) => ({ value: f, label: f })));

const tabFontSizeNum = computed(() => Number(tabFontSize.value) || 13);
const statusFontSizeNum = computed(() => Number(statusFontSize.value) || 13);
const editorFontSizeNum = computed(() => Number(editorFontSize.value) || 15);
const uiFontSizeNum = computed(() => Number(uiFontSize.value) || 13);

const shortcuts = computed(() => [
    { key: 'new', keys: ['Ctrl', 'N'], label: 'act.new' },
    { key: 'open', keys: ['Ctrl', 'O'], label: 'act.open' },
    { key: 'save', keys: ['Ctrl', 'S'], label: 'act.save' },
    { key: 'saveAs', keys: ['Ctrl', 'Shift', 'S'], label: 'act.saveAs' },
    { key: 'closeTab', keys: ['Ctrl', 'W'], label: 'ctx.closeTab' },
    { key: 'nextTab', keys: ['Ctrl', 'PageDown'], label: 'act.nextTab' },
    { key: 'prevTab', keys: ['Ctrl', 'PageUp'], label: 'act.prevTab' },
    { key: 'moveTabLeft', keys: ['Ctrl', 'Shift', 'PageUp'], label: 'act.moveTabLeft' },
    { key: 'moveTabRight', keys: ['Ctrl', 'Shift', 'PageDown'], label: 'act.moveTabRight' },
    { key: 'zoomWheel', keys: ['Ctrl', t('key.wheel')], label: 'act.zoom' },
    { key: 'zoomIn', keys: ['Ctrl', '='], label: 'act.zoomIn' },
    { key: 'zoomOut', keys: ['Ctrl', '-'], label: 'act.zoomOut' },
    { key: 'zoomReset', keys: ['Ctrl', '0'], label: 'act.zoomReset' },
    { key: 'wordWrap', keys: ['Alt', 'Z'], label: 'act.toggleWordWrap' },
    { key: 'markdownPreview', keys: ['Ctrl', 'Shift', 'M'], label: 'act.markdownPreview' },
    { key: 'languagePicker', keys: ['Ctrl', 'K', 'Ctrl', 'M'], label: 'act.languagePicker' },
    { key: 'toggleComment', keys: ['Ctrl', '/'], label: 'act.toggleComment' },
    { key: 'toggleBlockComment', keys: ['Alt', 'A'], label: 'act.toggleBlockComment' },
    { key: 'moveLineUp', keys: ['Alt', '↑'], label: 'act.moveLineUp' },
    { key: 'moveLineDown', keys: ['Alt', '↓'], label: 'act.moveLineDown' },
    { key: 'addCursorAbove', keys: ['Ctrl', 'Alt', '↑'], label: 'act.addCursorAbove' },
    { key: 'addCursorBelow', keys: ['Ctrl', 'Alt', '↓'], label: 'act.addCursorBelow' },
    { key: 'deleteLine', keys: ['Ctrl', 'Shift', 'K'], label: 'act.deleteLine' },
    { key: 'find', keys: ['Ctrl', 'F'], label: 'menu.find' },
    { key: 'replace', keys: ['Ctrl', 'H'], label: 'menu.replace' },
    { key: 'settings', keys: ['Ctrl', ','], label: 'menu.settings' },
    { key: 'closeSettings', keys: ['Esc'], label: 'settings.closeSettings' }
]);

// 统一：更新本地状态 + 持久化（主进程会推送主窗口实时应用）
function persist(key, value) {
    window.editbox.settingsSet(key, value);
}

function changeLocale(mode) {
    localeMode.value = mode;
    persist('localeMode', mode);
    locale.value = mode === 'system'
        ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US')
        : mode;
}

function onTheme(v) {
    theme.value = v;
    persist('theme', v);
}

function onZoomChange(v) {
    zoomLevel.value = v / 100;
    // 缩放在主窗口生效（设置窗口自身不缩放）
    window.editbox.zoomSet(v / 100);
}

function onTabSize(v) {
    tabSize.value = v;
    persist('tabSize', v);
}

function onMarkdownPreview(v) {
    markdownLivePreview.value = v;
    persist('markdownLivePreview', v);
}

function onTabFont(v) {
    tabFontFamily.value = v;
    persist('tabFontFamily', v);
}
function onTabFontSize(v) {
    tabFontSize.value = v;
    persist('tabFontSize', v + 'px');
}
function onStatusFont(v) {
    statusFontFamily.value = v;
    persist('statusFontFamily', v);
}
function onStatusFontSize(v) {
    statusFontSize.value = v;
    persist('statusFontSize', v + 'px');
}
function onEditorFont(v) {
    editorFontFamily.value = v;
    persist('editorFontFamily', v);
}
function onEditorFontSize(v) {
    editorFontSize.value = v;
    persist('editorFontSize', v + 'px');
}
// 设置界面（本窗口）字号：仅作用于设置窗口自身，主窗口界面文字不受影响
function onUiFontSize(v) {
    uiFontSize.value = v;
    applyUiFontSize(v);
    persist('uiFontSize', v + 'px');
}

function applyUiFontSize(sizePx) {
    const px = Number(sizePx) || 13;
    const root = document.documentElement.style;
    root.setProperty('--ui-font-size', px + 'px');
    // Element Plus 组件文字随界面字号同步（默认 14px ≈ 13px × 1.08）
    root.setProperty('--el-font-size-base', Math.round(px * 1.08) + 'px');
}

// Esc 关闭设置窗口；下拉展开时不关闭（由 Element Plus 自行收起下拉）
function isDropdownOpen() {
    return [...document.querySelectorAll('.el-popper')].some((el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

function onEscClose(e) {
    if (e.key === 'Escape' && !isDropdownOpen()) {
        e.preventDefault();
        window.editbox.closeSettings();
    }
}

onMounted(async () => {
    document.addEventListener('keydown', onEscClose);
    // 加载系统字体列表
    try {
        fontOptions.value = await window.editbox.listFonts();
    } catch (e) {
        fontOptions.value = [];
    }

    try {
        const s = await window.editbox.settingsGetAll();
        localeMode.value = s.localeMode || 'system';
        theme.value = s.theme || 'light';
        zoomLevel.value = await window.editbox.zoomGet();
        tabSize.value = [2, 4, 8].includes(Number(s.tabSize)) ? Number(s.tabSize) : 4;
        markdownLivePreview.value = s.markdownLivePreview !== false;
        tabFontFamily.value = s.tabFontFamily || '';
        tabFontSize.value = parseInt(s.tabFontSize) || 13;
        statusFontFamily.value = s.statusFontFamily || '';
        statusFontSize.value = parseInt(s.statusFontSize) || 13;
        editorFontFamily.value = s.editorFontFamily || '';
        editorFontSize.value = parseInt(s.editorFontSize) || 15;
        uiFontSize.value = parseInt(s.uiFontSize) || 13;
        applyUiFontSize(uiFontSize.value);
        // 应用语言
        const mode = localeMode.value;
        locale.value = mode === 'system'
            ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US')
            : mode;
    } catch (e) { /* ignore */ }
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onEscClose);
});
</script>

<style scoped>
.settings-window {
    height: 100vh;
    display: flex;
    overflow: hidden;
}
.side-nav {
    flex: none;
    width: 180px;
    background: var(--el-fill-color-light);
    border-right: 1px solid var(--el-border-color);
    padding: 16px 0;
}
.nav-title {
    padding: 0 20px 16px;
    font-size: calc(var(--ui-font-size) * 1.15);
    font-weight: 600;
    color: var(--el-text-color-primary);
    border-bottom: 1px solid var(--el-border-color-lighter);
    margin-bottom: 8px;
}
.side-nav ul {
    list-style: none;
    margin: 0;
    padding: 0;
}
.side-nav li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    cursor: pointer;
    font-size: calc(var(--ui-font-size) * 1.08);
    color: var(--el-text-color-regular);
}
.side-nav li:hover {
    background: var(--el-fill-color);
}
.side-nav li.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    border-right: 3px solid var(--el-color-primary);
}
.content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
}
.pane h2 {
    margin: 0 0 20px;
    font-size: calc(var(--ui-font-size) * 1.38);
}
.row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 18px;
}
.row > label {
    width: 120px;
    font-size: calc(var(--ui-font-size) * 1.08);
    color: var(--el-text-color-regular);
}
.unit {
    color: var(--el-text-color-secondary);
    font-size: var(--ui-font-size);
}
.desc-inline {
    color: var(--el-text-color-secondary);
    font-size: var(--ui-font-size);
}
.zoom-row {
    display: flex;
    align-items: center;
    gap: 12px;
}
.zoom-val {
    font-size: var(--ui-font-size);
    color: var(--el-text-color-secondary);
    min-width: 48px;
}
.desc {
    font-size: var(--ui-font-size);
    color: var(--el-text-color-secondary);
    margin: 0 0 16px;
}
.shortcut-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--ui-font-size);
}
.shortcut-table th,
.shortcut-table td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
}
.shortcut-table th {
    color: var(--el-text-color-secondary);
    font-weight: 500;
}
.kbd-list {
    display: inline-flex;
    gap: 4px;
}
kbd {
    padding: 2px 8px;
    border: 1px solid var(--el-border-color);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--el-bg-color);
    font-family: Consolas, monospace;
    font-size: calc(var(--ui-font-size) * 0.92);
    user-select: none;
}
.about {
    text-align: center;
}
.about .logo-box {
    margin: 24px 0 12px;
}
.about .logo-box img {
    width: 64px;
    height: 64px;
    border-radius: 12px;
}
.about .app-name {
    font-size: calc(var(--ui-font-size) * 1.7);
    font-weight: 600;
    margin: 8px 0 4px;
}
.about .version {
    color: var(--el-text-color-secondary);
    margin: 0 0 16px;
}
.about .tech {
    color: var(--el-text-color-secondary);
    font-size: calc(var(--ui-font-size) * 0.92);
    margin-top: 8px;
}
</style>
