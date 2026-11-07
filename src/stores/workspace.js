/**
 * workspace store — 工作区状态与项目列表
 *
 * 数据来源：主进程 lib/workspace.js（索引）与 lib/projects.js（项目）。
 * 编辑上下文切换由 editor store 负责；本 store 只负责工作区元信息与索引。
 */
import { defineStore } from 'pinia';
import { ElMessage, ElMessageBox } from 'element-plus';
import i18n from '@/i18n';
import { useEditorStore } from '@/stores/editor';

const EMPTY_INDEX = {
    revision: 0,
    scanning: false,
    truncated: false,
    fileCount: 0,
    dirCount: 0,
    error: null
};

export const useWorkspaceStore = defineStore('workspace', {
    state: () => ({
        meta: null,            // WorkspaceMeta | null
        files: [],             // FileEntry[]
        index: { ...EMPTY_INDEX },
        error: null,           // 索引/根目录错误：null | 'ROOT_UNREADABLE'
        // 同步读取 localStorage 镜像作为首帧状态，避免启动时主侧栏先以默认显示再被隐藏造成闪烁
        sidebarVisible: localStorage.getItem('editbox-show-sidebar') !== 'false',
        explorerFontSize: 13,   // 文件浏览器（主侧栏文件树）字号
        sidebarWidth: 260,      // 主侧栏宽度（px）
        projects: [],           // Project[]（含 exists 字段）
        recents: []             // 最近工作区根目录（string[]，未保存为项目时也可在项目选择器中打开）
    }),

    actions: {
        // ---------- 初始化 ----------
        async hydrate() {
            try {
                const settings = await window.editbox.settingsGetAll();
                this.sidebarVisible = settings.showSidebar !== false;
                localStorage.setItem('editbox-show-sidebar', String(this.sidebarVisible));
                this.explorerFontSize = parseInt(settings.explorerFontSize) || 13;
                this.sidebarWidth = Math.min(600, Math.max(180, parseInt(settings.sidebarWidth) || 260));
            } catch (error) {
                // 读取失败时保留 localStorage 镜像中的状态
            }
            await this.loadProjects();
        },

        bindEvents() {
            window.editbox.onWorkspaceChanged((meta) => {
                this.meta = meta || null;
                if (!meta) {
                    this.files = [];
                    this.index = { ...EMPTY_INDEX };
                    this.error = null;
                }
            });
            window.editbox.onWorkspaceIndexUpdated((snapshot) => {
                this.applyIndex(snapshot);
            });
        },

        applyIndex(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') return;
            this.files = Array.isArray(snapshot.files) ? snapshot.files : [];
            this.index = {
                revision: Number(snapshot.revision) || 0,
                scanning: Boolean(snapshot.scanning),
                truncated: Boolean(snapshot.truncated),
                fileCount: Number(snapshot.fileCount) || this.files.length,
                dirCount: Number(snapshot.dirCount) || 0,
                error: snapshot.error || null
            };
            this.error = snapshot.error || null;
        },

        // ---------- 打开 / 关闭 / 刷新 ----------
        async afterOpen(meta) {
            const editor = useEditorStore();
            let result = { switched: false, dirtyCount: 0 };
            try {
                result = await editor.switchContext('ws:' + meta.root);
            } catch (error) {
                // 上下文切换失败不应中断工作区打开
                console.error('[cb-editbox] 编辑上下文切换失败:', error.message);
            }
            this.meta = meta;
            this.files = [];
            this.index = { ...EMPTY_INDEX, scanning: true };
            this.error = null;
            const snapshot = await window.editbox.getWorkspaceIndex();
            if (snapshot) this.applyIndex(snapshot);
            if (result.dirtyCount > 0) {
                ElMessage.info(i18n.global.t('msg.contextSwitched', { count: result.dirtyCount }));
            }
        },

        async open(root) {
            const ret = await window.editbox.openWorkspace(root);
            if (!ret.ok) {
                ElMessage.error(i18n.global.t('msg.workspaceOpenFailed'));
                return ret;
            }
            await this.afterOpen(ret.meta);
            return ret;
        },

        async openDialog() {
            const ret = await window.editbox.openWorkspaceDialog();
            if (!ret.ok) {
                if (!ret.canceled) ElMessage.error(i18n.global.t('msg.workspaceOpenFailed'));
                return ret;
            }
            await this.afterOpen(ret.meta);
            return ret;
        },

        async close() {
            // 先清空工作区界面状态，确保无论上下文切换是否成功，侧栏都不会残留旧目录索引
            this.meta = null;
            this.files = [];
            this.index = { ...EMPTY_INDEX };
            this.error = null;
            const editor = useEditorStore();
            let result = { switched: false, dirtyCount: 0 };
            try {
                result = await editor.switchContext('default');
            } finally {
                await window.editbox.closeWorkspace();
            }
            if (result.dirtyCount > 0) {
                ElMessage.info(i18n.global.t('msg.contextSwitched', { count: result.dirtyCount }));
            }
            return { ok: true };
        },

        async refresh() {
            if (!this.meta) return { ok: false };
            return window.editbox.refreshWorkspace();
        },

        async restoreWorkspace() {
            const editor = useEditorStore();
            const root = editor.contextRoot(editor.contextKey);
            if (!root) return;
            const ret = await window.editbox.openWorkspace(root);
            if (!ret.ok) {
                await editor.switchContext('default');
                this.meta = null;
                this.files = [];
                this.index = { ...EMPTY_INDEX };
                this.error = null;
                return;
            }
            this.meta = ret.meta;
            const snapshot = await window.editbox.getWorkspaceIndex();
            if (snapshot) this.applyIndex(snapshot);
        },

        async setSidebarVisible(visible) {
            this.sidebarVisible = Boolean(visible);
            localStorage.setItem('editbox-show-sidebar', String(this.sidebarVisible));
            await window.editbox.settingsSet('showSidebar', this.sidebarVisible);
        },

        // ---------- 项目 ----------
        async loadProjects() {
            try {
                const ret = await window.editbox.projectList();
                this.projects = ret && Array.isArray(ret.items) ? ret.items : [];
            } catch (error) {
                this.projects = [];
            }
            try {
                const ret = await window.editbox.workspaceRecentGet();
                this.recents = Array.isArray(ret) ? ret : [];
            } catch (error) {
                this.recents = [];
            }
            return this.projects;
        },

        async saveCurrentAsProject() {
            const t = i18n.global.t;
            if (!this.meta) {
                ElMessage.warning(t('msg.projectNeedWorkspace'));
                return { ok: false };
            }
            const result = await ElMessageBox.prompt(t('project.namePlaceholder'), t('project.saveTitle'), {
                confirmButtonText: t('btn.ok'),
                cancelButtonText: t('btn.cancel'),
                inputValue: this.meta.name,
                inputValidator: (value) => {
                    const name = String(value || '').trim();
                    return name.length >= 1 && name.length <= 60;
                }
            }).catch(() => null);
            if (!result) return { ok: false, canceled: true };

            const ret = await window.editbox.projectSave({
                root: this.meta.root,
                name: String(result.value || '').trim()
            });
            if (!ret || !ret.ok) {
                ElMessage.warning(ret && ret.limit ? t('project.limit') : t('msg.projectSaveFailed'));
                return ret || { ok: false };
            }
            await this.loadProjects();
            if (ret.created) ElMessage.success(t('project.saved', { name: ret.project.name }));
            else ElMessage.info(t('project.alreadySaved', { name: ret.project.name }));
            return ret;
        },

        async openProject(project) {
            const t = i18n.global.t;
            const ret = await window.editbox.projectOpen({ id: project.id });
            if (!ret || !ret.ok) {
                if (ret && ret.missing) {
                    const answer = await ElMessageBox.confirm(
                        t('project.missingHint', { path: project.root }),
                        t('project.missing'),
                        {
                            confirmButtonText: t('btn.ok'),
                            cancelButtonText: t('btn.cancel'),
                            type: 'warning'
                        }
                    ).catch(() => null);
                    if (answer) await this.removeProject(project.id, { skipConfirm: true });
                }
                return ret || { ok: false };
            }
            const opened = await this.open(ret.root);
            await this.loadProjects();
            return opened;
        },

        async removeRecent(root) {
            await window.editbox.workspaceRecentRemove(root);
            await this.loadProjects();
            return { ok: true };
        },

        async removeProject(id, { skipConfirm = false } = {}) {
            const t = i18n.global.t;
            const project = this.projects.find((item) => item.id === id);
            if (!project) return { ok: false };
            if (!skipConfirm) {
                const answer = await ElMessageBox.confirm(
                    t('project.removeHint'),
                    t('project.removeTitle', { name: project.name }),
                    {
                        confirmButtonText: t('btn.ok'),
                        cancelButtonText: t('btn.cancel'),
                        type: 'warning'
                    }
                ).catch(() => null);
                if (!answer) return { ok: false, canceled: true };
            }
            const ret = await window.editbox.projectRemove({ id });
            await this.loadProjects();
            return ret || { ok: false };
        },

        async renameProject(id) {
            const t = i18n.global.t;
            const project = this.projects.find((item) => item.id === id);
            if (!project) return { ok: false };
            const result = await ElMessageBox.prompt(t('project.nameLabel'), t('project.renameTitle'), {
                confirmButtonText: t('btn.ok'),
                cancelButtonText: t('btn.cancel'),
                inputValue: project.name,
                inputValidator: (value) => {
                    const name = String(value || '').trim();
                    return name.length >= 1 && name.length <= 60;
                }
            }).catch(() => null);
            if (!result) return { ok: false, canceled: true };
            const ret = await window.editbox.projectRename({
                id,
                name: String(result.value || '').trim()
            });
            await this.loadProjects();
            return ret || { ok: false };
        }
    }
});
