/**
 * cb-editbox preload
 *
 * 暴露 window.editbox：
 *   - openDialog() / saveDialog(defaultPath)
 *   - readFile(path) / readFileBackup(backupId)
 *   - writeFile(payload) / writeFileForceUtf8(payload)
 *   - revealFile(path) / openExternal(url)
 *   - recentGet() / recentAdd(path) / recentRemove(path)
 *   - saveBackup({path, content})
 *   - sessionGet() / sessionUpdate(payload)
 *   - openWorkspaceDialog() / openWorkspace(root) / closeWorkspace()
 *   - getWorkspaceState() / getWorkspaceIndex() / refreshWorkspace()
 *   - workspaceRecentGet() / workspaceRecentRemove(root) / workspaceRecentClear()
 *   - projectList() / projectSave(payload) / projectOpen(payload) / projectRemove(payload) / projectRename(payload)
 *   - watchRegister(path, mtimeMs, size) / watchUnregister(path)
 *   - zoomGet() / zoomSet(factor) / zoomFactor()
 *   - pathForFile(file)  拖拽文件 → 绝对路径（Electron 32+ 移除 File.path）
 *   - onFileExternalChanged(cb) / onFileDeleted(cb) / onRequestClose(cb) / onZoomChanged(cb)
 *   - storeGet(name, key) / storeSet(name, key, value)  canbox-core 通用键值
 */
const { contextBridge, ipcRenderer, webFrame, webUtils } = require('electron');
const path = require('path');
const pkg = require(path.join(__dirname, 'package.json'));

window.addEventListener('DOMContentLoaded', () => {
    document.title = pkg.displayName + ' - v' + pkg.version;
});

contextBridge.exposeInMainWorld('editbox', {
    openDialog: () => ipcRenderer.invoke('editbox.openFileDialog'),
    saveDialog: (defaultPath) => ipcRenderer.invoke('editbox.saveFileDialog', defaultPath),

    readFile: (filePath) => ipcRenderer.invoke('editbox.readFile', filePath),
    readFileBackup: (backupId) => ipcRenderer.invoke('editbox.readFileBackup', backupId),
    writeFile: (payload) => ipcRenderer.invoke('editbox.writeFile', payload),
    writeFileForceUtf8: (payload) => ipcRenderer.invoke('editbox.writeFileForceUtf8', payload),
    revealFile: (filePath) => ipcRenderer.invoke('editbox.revealFile', filePath),
    openExternal: (url) => ipcRenderer.invoke('editbox.openExternal', url),
    toggleMarkdownPreview: () => ipcRenderer.invoke('editbox.toggleMarkdownPreview'),

    recentGet: () => ipcRenderer.invoke('editbox.recentGet'),
    recentAdd: (filePath) => ipcRenderer.invoke('editbox.recentAdd', filePath),
    recentRemove: (filePath) => ipcRenderer.invoke('editbox.recentRemove', filePath),

    saveBackup: (payload) => ipcRenderer.invoke('editbox.saveBackup', payload),

    sessionGet: () => ipcRenderer.invoke('editbox.sessionGet'),
    sessionUpdate: (payload) => ipcRenderer.invoke('editbox.sessionUpdate', payload),

    openWorkspaceDialog: () => ipcRenderer.invoke('editbox.workspaceOpenDialog'),
    openWorkspace: (root) => ipcRenderer.invoke('editbox.workspaceOpen', root),
    closeWorkspace: () => ipcRenderer.invoke('editbox.workspaceClose'),
    getWorkspaceState: () => ipcRenderer.invoke('editbox.workspaceState'),
    getWorkspaceIndex: () => ipcRenderer.invoke('editbox.workspaceIndex'),
    refreshWorkspace: () => ipcRenderer.invoke('editbox.workspaceRefresh'),
    workspaceRecentGet: () => ipcRenderer.invoke('editbox.workspaceRecentGet'),
    workspaceRecentRemove: (root) => ipcRenderer.invoke('editbox.workspaceRecentRemove', root),
    workspaceRecentClear: () => ipcRenderer.invoke('editbox.workspaceRecentClear'),

    projectList: () => ipcRenderer.invoke('editbox.projectList'),
    projectSave: (payload) => ipcRenderer.invoke('editbox.projectSave', payload),
    projectOpen: (payload) => ipcRenderer.invoke('editbox.projectOpen', payload),
    projectRemove: (payload) => ipcRenderer.invoke('editbox.projectRemove', payload),
    projectRename: (payload) => ipcRenderer.invoke('editbox.projectRename', payload),

    watchRegister: (filePath, mtimeMs, size) =>
        ipcRenderer.invoke('editbox.watchRegister', filePath, mtimeMs, size),
    watchUnregister: (filePath) => ipcRenderer.invoke('editbox.watchUnregister', filePath),

    zoomGet: () => ipcRenderer.invoke('editbox.zoomGet'),
    zoomSet: (factor) => ipcRenderer.invoke('editbox.zoomSet', factor),
    zoomFactor: () => webFrame.getZoomFactor(),

    openSettings: () => ipcRenderer.invoke('editbox.openSettings'),
    closeSettings: () => ipcRenderer.invoke('editbox.closeSettings'),
    settingsGetAll: () => ipcRenderer.invoke('editbox.settingsGetAll'),
    settingsSet: (key, value) => ipcRenderer.invoke('editbox.settingsSet', key, value),

    pathForFile: (file) => webUtils.getPathForFile(file),

    performClose: () => ipcRenderer.invoke('editbox.performClose'),
    listFonts: () => ipcRenderer.invoke('editbox.listFonts'),

    onFileExternalChanged: (cb) => {
        ipcRenderer.on('editbox.fileExternalChanged', (_e, payload) => cb(payload));
    },
    onFileDeleted: (cb) => {
        ipcRenderer.on('editbox.fileDeleted', (_e, payload) => cb(payload));
    },
    onZoomChanged: (cb) => {
        ipcRenderer.on('editbox.zoomChanged', (_e, factor) => cb(factor));
    },
    onRequestClose: (cb) => {
        ipcRenderer.on('editbox.requestClose', () => cb());
    },
    onMenuAction: (cb) => {
        ipcRenderer.on('editbox.menuAction', (_e, action, payload) => cb(action, payload));
    },
    onSettingApplied: (cb) => {
        ipcRenderer.on('editbox.settingApplied', (_e, key, value) => cb(key, value));
    },
    onWorkspaceChanged: (cb) => {
        ipcRenderer.on('editbox.workspaceChanged', (_e, meta) => cb(meta));
    },
    onWorkspaceIndexUpdated: (cb) => {
        ipcRenderer.on('editbox.workspaceIndexUpdated', (_e, snapshot) => cb(snapshot));
    },

    storeGet: (name, key) => ipcRenderer.invoke('canbox.store.get', name, key),
    storeSet: (name, key, value) => ipcRenderer.invoke('canbox.store.set', name, key, value)
});
