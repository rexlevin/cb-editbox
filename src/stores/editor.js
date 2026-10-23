/**
 * editor store — 标签页状态唯一持有者
 *
 * tab 数据结构：
 *   { id, path, name, untitled, content, encoding, hasBom,
 *     eol, mixed, mtimeMs, size, dirty, backupId, docRev,
 *     cursorLine, cursorCol, scrollTop }
 *   - content 始终为 \n 归一文本；eol ∈ 'crlf'|'lf'|'cr'
 *   - docRev 递增触发 CodeEditor 外部内容替换（重载/恢复）
 *
 * 注意：Pinia action 运行在组件上下文之外，不能调用 useI18n()（需 getCurrentInstance），
 * 统一使用 i18n.global.t 取文案。
 */
import { defineStore } from 'pinia';
import i18n from '@/i18n';
import { ElMessageBox, ElMessage } from 'element-plus';

let _tabSeq = 0;
let _backupTimer = null;
const _backupPending = new Set(); // 待备份 tabId

export const useEditorStore = defineStore('editor', {
    state: () => ({
        tabs: [],
        activeId: null,
        zoomFactor: 1 // 界面缩放比例（唯一来源，状态栏据此显示）
    }),

    getters: {
        activeTab(state) {
            return state.tabs.find(t => t.id === state.activeId) || null;
        },
        dirtyCount(state) {
            return state.tabs.filter(t => t.dirty).length;
        }
    },

    actions: {
        // ---------- 会话恢复 ----------
        async restoreSession() {
            const session = await window.editbox.sessionGet();
            const tabs = Array.isArray(session.tabs) ? session.tabs : [];
            for (const saved of tabs) {
                if (saved.backupId) {
                    const ret = await window.editbox.readFileBackup(saved.backupId);
                    if (ret.ok) {
                        this.pushTab({
                            path: saved.path,
                            name: saved.untitled ? saved.name : saved.path.split(/[\\/]/).pop(),
                            untitled: Boolean(saved.untitled),
                            content: ret.content,
                            encoding: saved.encoding || 'utf-8',
                            hasBom: Boolean(saved.hasBom),
                            eol: saved.eol || 'lf',
                            mixed: Boolean(saved.mixed),
                            mtimeMs: saved.path ? 0 : null,
                            size: null,
                            dirty: true,
                            backupId: saved.backupId,
                            cursorLine: saved.cursorLine || 1,
                            cursorCol: saved.cursorCol || 1,
                            scrollTop: saved.scrollTop || 0
                        });
                        continue;
                    }
                }
                if (saved.path) {
                    const ret = await window.editbox.readFile(saved.path);
                    if (ret.ok) {
                        this.pushTab({
                            path: saved.path,
                            name: saved.path.split(/[\\/]/).pop(),
                            untitled: false,
                            content: ret.content,
                            encoding: ret.encoding,
                            hasBom: ret.hasBom,
                            eol: ret.eol.dominant,
                            mixed: ret.eol.mixed,
                            mtimeMs: ret.mtimeMs,
                            size: ret.size,
                            dirty: false,
                            backupId: null,
                            cursorLine: saved.cursorLine || 1,
                            cursorCol: saved.cursorCol || 1,
                            scrollTop: saved.scrollTop || 0
                        });
                        await window.editbox.watchRegister(saved.path, ret.mtimeMs, ret.size);
                    }
                }
            }
            if (tabs.length > 0) {
                const idx = Math.min(session.activeIndex || 0, this.tabs.length - 1);
                this.activeId = this.tabs[Math.max(idx, 0)] ? this.tabs[Math.max(idx, 0)].id : null;
            }
        },

        // ---------- 打开 / 新建 ----------
        async openPaths(paths) {
            const opened = [];
            for (const p of paths || []) {
                const existing = this.tabs.find(t => t.path === p);
                if (existing) {
                    this.activeId = existing.id;
                    opened.push(p);
                    continue;
                }
                const ret = await window.editbox.readFile(p);
                if (!ret.ok) {
                    ElMessage.error(ret.tooLarge
                        ? i18n.global.t('msg.tooLarge')
                        : i18n.global.t('msg.openFailed'));
                    continue;
                }
                const tab = this.pushTab({
                    path: p,
                    name: p.split(/[\\/]/).pop(),
                    untitled: false,
                    content: ret.content,
                    encoding: ret.encoding,
                    hasBom: ret.hasBom,
                    eol: ret.eol.dominant,
                    mixed: ret.eol.mixed,
                    mtimeMs: ret.mtimeMs,
                    size: ret.size,
                    dirty: false,
                    backupId: null,
                    cursorLine: 1,
                    cursorCol: 1,
                    scrollTop: 0
                });
                await window.editbox.watchRegister(p, ret.mtimeMs, ret.size);
                await window.editbox.recentAdd(p);
                this.activeId = tab.id;
                opened.push(p);
            }
            this.persistSession();
            return opened;
        },

        newTab() {
            const n = this.tabs.filter(t => t.untitled).length + 1;
            const tab = this.pushTab({
                path: null,
                name: 'Untitled-' + n,
                untitled: true,
                content: '',
                encoding: 'utf-8',
                hasBom: false,
                eol: 'lf',
                mixed: false,
                mtimeMs: null,
                size: null,
                dirty: false,
                backupId: null,
                cursorLine: 1,
                cursorCol: 1,
                scrollTop: 0
            });
            this.activeId = tab.id;
            this.persistSession();
            return tab;
        },

        pushTab(fields) {
            _tabSeq += 1;
            const tab = { id: _tabSeq, docRev: 0, ...fields };
            this.tabs.push(tab);
            return tab;
        },

        // ---------- 编辑回写（CodeEditor 调用） ----------
        markDirty(tabId, { content, cursorLine, cursorCol, scrollTop }) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab) return;
            tab.content = content;
            tab.dirty = true;
            if (cursorLine !== undefined) tab.cursorLine = cursorLine;
            if (cursorCol !== undefined) tab.cursorCol = cursorCol;
            if (scrollTop !== undefined) tab.scrollTop = scrollTop;
            this.scheduleBackup(tab.id);
            this.persistSession();
        },

        updateCursor(tabId, cursorLine, cursorCol) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab) return;
            tab.cursorLine = cursorLine;
            tab.cursorCol = cursorCol;
        },

        updateScroll(tabId, scrollTop) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab) return;
            tab.scrollTop = scrollTop;
        },

        // 备份去抖：2s 内多次修改合并，同 tab 只保留最新一次
        scheduleBackup(tabId) {
            _backupPending.add(tabId);
            if (_backupTimer) return;
            _backupTimer = setTimeout(async () => {
                _backupTimer = null;
                const ids = [..._backupPending];
                _backupPending.clear();
                for (const id of ids) {
                    const tab = this.tabs.find(t => t.id === id);
                    if (!tab || !tab.dirty) continue;
                    const ret = await window.editbox.saveBackup({
                        path: tab.path,
                        content: tab.content
                    });
                    if (ret.ok) {
                        const t = this.tabs.find(t2 => t2.id === id);
                        if (t) t.backupId = ret.backupId;
                    }
                }
                this.persistSession();
            }, 2000);
        },

        // ---------- 保存 ----------
        async saveTab(tabId) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab) return { ok: false };
            if (tab.untitled || !tab.path) return this.saveTabAs(tabId);
            const ret = await window.editbox.writeFile({
                path: tab.path,
                content: tab.content,
                encoding: tab.encoding,
                hasBom: tab.hasBom,
                eol: tab.eol
            });
            if (ret.ok) {
                tab.dirty = false;
                tab.mtimeMs = ret.mtimeMs;
                tab.size = ret.size;
                this.persistSession();
                return { ok: true };
            }
            if (ret.lossy) {
                const t = i18n.global.t;
                const answer = await ElMessageBox.confirm(t('msg.lossyBody'), t('msg.lossyTitle'), {
                    confirmButtonText: t('btn.utf8Save'),
                    cancelButtonText: t('btn.cancel'),
                    type: 'warning'
                }).catch(() => null);
                if (!answer) return { ok: false, canceled: true };
                return this.forceUtf8Save(tabId);
            }
            ElMessage.error(i18n.global.t('msg.saveFailed'));
            return { ok: false };
        },

        async forceUtf8Save(tabId) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab) return { ok: false };
            const ret = await window.editbox.writeFileForceUtf8({
                path: tab.path,
                content: tab.content,
                eol: tab.eol
            });
            if (ret.ok) {
                tab.encoding = 'utf-8';
                tab.hasBom = false;
                tab.dirty = false;
                tab.mtimeMs = ret.mtimeMs;
                tab.size = ret.size;
                this.persistSession();
                return { ok: true };
            }
            ElMessage.error(i18n.global.t('msg.saveFailed'));
            return { ok: false };
        },

        async saveTabAs(tabId) {
            const t = i18n.global.t;
            const tab = this.tabs.find(t2 => t2.id === tabId);
            if (!tab) return { ok: false };
            const target = await window.editbox.saveDialog(tab.path || tab.name);
            if (!target) return { ok: false, canceled: true };
            tab.path = target;
            tab.name = target.split(/[\\/]/).pop();
            tab.untitled = false;
            const ret = await window.editbox.writeFile({
                path: target,
                content: tab.content,
                encoding: tab.encoding,
                hasBom: tab.hasBom,
                eol: tab.eol
            });
            if (ret.ok) {
                tab.dirty = false;
                tab.mtimeMs = ret.mtimeMs;
                tab.size = ret.size;
                await window.editbox.watchRegister(target, ret.mtimeMs, ret.size);
                await window.editbox.recentAdd(target);
                this.persistSession();
                return { ok: true };
            }
            if (ret.lossy) {
                const answer = await ElMessageBox.confirm(t('msg.lossyBody'), t('msg.lossyTitle'), {
                    confirmButtonText: t('btn.utf8Save'),
                    cancelButtonText: t('btn.cancel'),
                    type: 'warning'
                }).catch(() => null);
                if (!answer) return { ok: false, canceled: true };
                const ret2 = await window.editbox.writeFileForceUtf8({
                    path: target, content: tab.content, eol: tab.eol
                });
                if (ret2.ok) {
                    tab.encoding = 'utf-8';
                    tab.hasBom = false;
                    tab.dirty = false;
                    tab.mtimeMs = ret2.mtimeMs;
                    tab.size = ret2.size;
                    await window.editbox.watchRegister(target, ret2.mtimeMs, ret2.size);
                    await window.editbox.recentAdd(target);
                    this.persistSession();
                    return { ok: true };
                }
            }
            ElMessage.error(t('msg.saveFailed'));
            return { ok: false };
        },

        // ---------- 重载 ----------
        async reloadTab(tabId, { skipConfirm = false } = {}) {
            const t = i18n.global.t;
            const tab = this.tabs.find(t2 => t2.id === tabId);
            if (!tab || !tab.path) return;
            if (!skipConfirm && tab.dirty) {
                const answer = await ElMessageBox.confirm(
                    t('msg.reloadBody'), t('msg.reloadTitle'),
                    { confirmButtonText: t('btn.reload'), cancelButtonText: t('btn.cancel'), type: 'warning' }
                ).catch(() => null);
                if (!answer) return;
            }
            const ret = await window.editbox.readFile(tab.path);
            if (!ret.ok) {
                ElMessage.error(t('msg.openFailed'));
                return;
            }
            tab.content = ret.content;
            tab.encoding = ret.encoding;
            tab.hasBom = ret.hasBom;
            tab.eol = ret.eol.dominant;
            tab.mixed = ret.eol.mixed;
            tab.mtimeMs = ret.mtimeMs;
            tab.size = ret.size;
            tab.dirty = false;
            tab.backupId = null;
            tab.docRev += 1; // 触发 CodeEditor 内容替换
            this.persistSession();
        },

        // ---------- EOL 转换 ----------
        setTabEol(tabId, eol) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab || tab.eol === eol) return;
            tab.eol = eol;
            tab.mixed = false;
            tab.dirty = true;
            this.scheduleBackup(tab.id);
            this.persistSession();
        },

        // ---------- 关闭 ----------
        async closeTab(tabId, { skipConfirm = false } = {}) {
            const t = i18n.global.t;
            const tab = this.tabs.find(t2 => t2.id === tabId);
            if (!tab) return false;
            // 未命名脏文档：不提示，静默保留备份（下次启动恢复）
            if (tab.dirty && !skipConfirm && tab.path) {
                const answer = await ElMessageBox.confirm(
                    t('msg.closeTabBody', { name: tab.name }), t('msg.closeTabTitle'),
                    {
                        confirmButtonText: t('btn.save'),
                        cancelButtonText: t('btn.dontSave'),
                        distinguishCancelAndClose: true,
                        type: 'warning'
                    }
                ).catch((action) => (action === 'cancel' ? 'dontSave' : null));
                // confirm=保存并关闭 / cancel=不保存 / close(右上角X)=取消
                if (!answer && answer !== 'dontSave') return false;
                if (answer === true) {
                    const saved = await this.saveTab(tabId);
                    if (!saved.ok) return false; // 保存失败（含用户取消另存为）→ 不关闭
                } else {
                    tab.backupId = null; // 不保存 → 丢弃备份
                }
            }
            if (tab.path) await window.editbox.watchUnregister(tab.path);
            this.tabs = this.tabs.filter(t2 => t2.id !== tabId);
            if (this.activeId === tabId) {
                const idx = this.tabs.findIndex(t2 => t2.id === tabId);
                const fallback = this.tabs[Math.min(Math.max(idx, 0), this.tabs.length - 1)];
                this.activeId = fallback ? fallback.id : null;
            }
            this.persistSession();
            return true;
        },

        async closeOthers(tabId) {
            for (const tab of [...this.tabs]) {
                if (tab.id !== tabId) {
                    const done = await this.closeTab(tab.id);
                    if (!done) return; // 用户取消 → 中止
                }
            }
        },

        // 移动标签页（Ctrl+Shift+PageUp/PageDown）：前移/后移一位
        moveTab(tabId, dir) {
            const idx = this.tabs.findIndex(t2 => t2.id === tabId);
            if (idx === -1) return;
            const target = idx + dir;
            if (target < 0 || target >= this.tabs.length) return; // 已在边界
            const [tab] = this.tabs.splice(idx, 1);
            this.tabs.splice(target, 0, tab);
            this.persistSession();
        },

        closeAll() {
            return this.confirmClose({ fromRequestClose: false });
        },

        // 窗口关闭协议（requestClose 推送 / 菜单全部关闭 共用）
        async confirmClose({ fromRequestClose }) {
            const t = i18n.global.t;
            // 仅对已保存到磁盘的脏文档提示；未命名脏文档静默保留备份，下次自动恢复
            const dirtyDiskTabs = this.tabs.filter(t2 => t2.dirty && t2.path);
            if (dirtyDiskTabs.length > 0) {
                const answer = await ElMessageBox.confirm(
                    t('msg.closeWindowBody', { count: dirtyDiskTabs.length }), t('msg.closeWindowTitle'),
                    {
                        confirmButtonText: t('btn.saveAll'),
                        cancelButtonText: t('btn.dontSave'),
                        distinguishCancelAndClose: true,
                        type: 'warning'
                    }
                ).catch((action) => (action === 'cancel' ? 'dontSave' : null));
                if (!answer && answer !== 'dontSave') return false;
                if (answer === true) {
                    for (const tab of dirtyDiskTabs) {
                        const saved = await this.saveTab(tab.id);
                        if (!saved.ok) return false;
                    }
                } else {
                    // 不保存：丢弃这些磁盘文件的备份
                    for (const tab of dirtyDiskTabs) tab.backupId = null;
                }
            }
            // 未命名脏文档保持 dirty + backupId，随会话持久化，下次恢复
            this.persistSession();
            if (fromRequestClose) {
                await window.editbox.performClose();
            } else {
                for (const tab of [...this.tabs]) {
                    if (tab.path) await window.editbox.watchUnregister(tab.path);
                }
                this.tabs = [];
                this.activeId = null;
                this.persistSession();
            }
            return true;
        },

        // ---------- 外部修改推送 ----------
        bindExternalChanged() {
            window.editbox.onFileExternalChanged(async ({ path: p }) => {
                const tab = this.tabs.find(t2 => t2.path === p);
                if (!tab) return;
                const ret = await window.editbox.readFile(p);
                if (!ret.ok) return;
                if (!tab.dirty) {
                    // 干净文档：自动重载 + 轻提示
                    tab.content = ret.content;
                    tab.encoding = ret.encoding;
                    tab.hasBom = ret.hasBom;
                    tab.eol = ret.eol.dominant;
                    tab.mixed = ret.eol.mixed;
                    tab.mtimeMs = ret.mtimeMs;
                    tab.size = ret.size;
                    tab.docRev += 1;
                    ElMessage.info(i18n.global.t('msg.externalReloaded', { name: tab.name }));
                    this.persistSession();
                } else {
                    // 脏文档：置冲突标记，由 EditorView 提示条处理
                    tab.externalConflict = { mtimeMs: ret.mtimeMs, size: ret.size };
                }
            });
        },

        resolveExternalConflict(tabId, mode) {
            const tab = this.tabs.find(t2 => t2.id === tabId);
            if (!tab) return;
            if (mode === 'reload') {
                this.reloadTab(tabId, { skipConfirm: true });
            }
            delete tab.externalConflict;
        },

        // ---------- 缩放 ----------
        async initZoom() {
            try {
                this.zoomFactor = (await window.editbox.zoomGet()) || 1;
            } catch (error) {
                this.zoomFactor = 1;
            }
        },

        async setZoom(factor) {
            const clamped = Math.max(0.5, Math.min(2.0, Math.round(factor * 10) / 10));
            this.zoomFactor = clamped; // 先本地更新，避免连续滚轮事件丢步
            this.zoomFactor = await window.editbox.zoomSet(clamped);
        },

        bindZoomChanged() {
            // 设置窗口滑杆等其它来源的缩放变更 → 主窗口状态栏实时跟随
            window.editbox.onZoomChanged((factor) => {
                this.zoomFactor = factor;
            });
        },

        // ---------- 文档语言（由 CodeEditor 上报实际生效的语言） ----------
        setTabLanguage(tabId, language) {
            const tab = this.tabs.find(t => t.id === tabId);
            if (tab) tab.language = language || null;
        },

        // ---------- 会话持久化（轻量，每次状态变化全量写） ----------
        persistSession() {
            const payload = {
                activeIndex: this.tabs.findIndex(t2 => t2.id === this.activeId),
                tabs: this.tabs.map(t2 => ({
                    path: t2.path,
                    name: t2.name,
                    untitled: t2.untitled,
                    encoding: t2.encoding,
                    hasBom: t2.hasBom,
                    eol: t2.eol,
                    mixed: t2.mixed,
                    dirty: t2.dirty,
                    backupId: t2.backupId,
                    cursorLine: t2.cursorLine,
                    cursorCol: t2.cursorCol,
                    scrollTop: t2.scrollTop
                }))
            };
            window.editbox.sessionUpdate(payload);
        }
    }
});
