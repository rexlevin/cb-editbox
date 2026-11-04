/**
 * cb-editbox — 主进程入口
 *
 * 标准 Electron APP，通过 canbox-core 注入启动：
 *   electron -r canbox-core/injection.js cb-editbox/
 *
 * 职责：窗口与缩放、文件读写（编码探测/EOL 统计/有损检测）、外部修改监视、
 * 未保存备份与会话持久化、脏文档关闭拦截协议。
 */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, net, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { detectEncoding, decode, encodeWithLossyCheck, bomBuffer } = require('./lib/encoding');
const { analyzeEol, convertEol, normalizeLf } = require('./lib/eol');
const watcher = require('./lib/watcher');
const { listFonts } = require('./lib/fonts');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const EOL_KEYS = ['crlf', 'lf', 'cr'];

// 本地图片协议：渲染进程把 Markdown 中的相对路径解析为绝对路径后，
// 通过 editbox-media://local/?p=<encodeURIComponent(path)> 交给主进程读取。
// （http://localhost:5181 页面无法直接加载 file:// 资源）
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif']);
protocol.registerSchemesAsPrivileged([{
    scheme: 'editbox-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
}]);

let mainWindow = null;
let forceClose = false;

// ---------------------------------------------------------------------------
// core 辅助
// ---------------------------------------------------------------------------
function corePath() {
    return global.__CANBOX_CORE_PATH__;
}

function usersDataPath() {
    return path.join(global.__CANBOX_ENV__.usersPath, 'data');
}

function getStore(name) {
    const store = require(path.join(corePath(), 'lib', 'store'));
    return store.getStore(global.__CANBOX_ENV__.appId, name, usersDataPath());
}

function backupDir() {
    return path.join(usersDataPath(), global.__CANBOX_ENV__.appId, 'backup');
}

// ---------------------------------------------------------------------------
// 最近打开文件（canbox-core store，上限 10 条）
// ---------------------------------------------------------------------------
const RECENT_LIMIT = 10;

// 读取时过滤已从磁盘移除的文件并去重
function readRecentFiles() {
    try {
        const list = getStore('recent').get('files');
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const valid = list.filter((p) => {
            if (typeof p !== 'string' || seen.has(p) || !fs.existsSync(p)) return false;
            seen.add(p);
            return true;
        }).slice(0, RECENT_LIMIT);
        // 已从磁盘移除的条目从存储中一并清理
        if (valid.length !== list.length) writeRecentFiles(valid);
        return valid;
    } catch (error) {
        return [];
    }
}

function writeRecentFiles(list) {
    try {
        getStore('recent').set('files', list.slice(0, RECENT_LIMIT));
    } catch (error) { /* ignore */ }
}

function addRecentFile(filePath) {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return;
    const list = readRecentFiles().filter(p => p !== filePath);
    list.unshift(filePath);
    writeRecentFiles(list);
    rebuildMenu();
}

function removeRecentFile(filePath) {
    writeRecentFiles(readRecentFiles().filter(p => p !== filePath));
    rebuildMenu();
}

function clearRecentFiles() {
    writeRecentFiles([]);
    rebuildMenu();
}

// ---------------------------------------------------------------------------
// IPC: 文件
// ---------------------------------------------------------------------------
ipcMain.handle('editbox.openFileDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('editbox.saveFileDialog', async (_e, defaultPath) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultPath || undefined
    });
    return result.canceled ? null : result.filePath;
});

/**
 * 读文件：探测编码、统计 EOL、归一为 \n 返回
 * @returns {object} { ok, content, encoding, hasBom, eol:{dominant,mixed,counts},
 *                     mtimeMs, size, error?, tooLarge? }
 */
ipcMain.handle('editbox.readFile', (_e, filePath) => {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_SIZE) {
            return { ok: false, tooLarge: true, error: 'FILE_TOO_LARGE' };
        }
        const buf = fs.readFileSync(filePath);
        const { encoding, hasBom } = detectEncoding(buf);
        const rawText = decode(buf, encoding);
        const eolInfo = analyzeEol(rawText);
        return {
            ok: true,
            content: normalizeLf(rawText),
            encoding,
            hasBom,
            eol: {
                dominant: eolInfo.dominant || 'lf',
                mixed: eolInfo.mixed,
                counts: eolInfo.counts
            },
            mtimeMs: stat.mtimeMs,
            size: stat.size
        };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('editbox.readFileBackup', (_e, backupId) => {
    try {
        const p = path.join(backupDir(), backupId + '.txt');
        return { ok: true, content: normalizeLf(fs.readFileSync(p, 'utf-8')) };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

// 写入流程（writeFile 与 writeFileForceUtf8 共用）
// steps: 校验 eol 白名单 → 有损检测 → 写盘 → 刷新 watcher 基线
function doWriteFile(filePath, content, encoding, hasBom, eol) {
    const targetEol = EOL_KEYS.includes(eol) ? eol : 'lf';
    const outText = convertEol(content, targetEol);
    const { buffer, lossy } = encodeWithLossyCheck(outText, encoding);
    if (lossy) return { ok: false, lossy: true };
    const bom = bomBuffer(encoding, hasBom);
    const finalBuf = bom ? Buffer.concat([bom, buffer]) : buffer;
    fs.writeFileSync(filePath, finalBuf);
    const stat = fs.statSync(filePath);
    watcher.updateBaseline(filePath, { mtimeMs: stat.mtimeMs, size: stat.size });
    return { ok: true, mtimeMs: stat.mtimeMs, size: stat.size };
}

ipcMain.handle('editbox.writeFile', (_e, payload) => {
    const { path: filePath, content, encoding, hasBom, eol } = payload;
    try {
        return doWriteFile(filePath, content, encoding, Boolean(hasBom), eol);
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('editbox.writeFileForceUtf8', (_e, payload) => {
    const { path: filePath, content, eol } = payload;
    try {
        return doWriteFile(filePath, content, 'utf-8', false, eol);
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('editbox.revealFile', (_e, filePath) => {
    shell.showItemInFolder(filePath);
    return { success: true };
});

// Markdown 链接：Ctrl+Click 在系统浏览器中打开（仅放行 http/https/mailto）
ipcMain.handle('editbox.openExternal', (_e, url) => {
    try {
        const parsed = new URL(String(url));
        if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return { ok: false };
        shell.openExternal(parsed.toString());
        return { ok: true };
    } catch (error) {
        return { ok: false };
    }
});

// ---------------------------------------------------------------------------
// IPC: 最近打开文件
// ---------------------------------------------------------------------------
ipcMain.handle('editbox.recentGet', () => readRecentFiles());

ipcMain.handle('editbox.recentAdd', (_e, filePath) => {
    addRecentFile(filePath);
    return { ok: true };
});

ipcMain.handle('editbox.recentRemove', (_e, filePath) => {
    removeRecentFile(filePath);
    return { ok: true };
});

ipcMain.handle('editbox.watchRegister', (_e, filePath, mtimeMs, size) => {
    const send = (channel, payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, payload);
        }
    };
    try {
        watcher.watchFile(filePath, { mtimeMs, size }, (changedPath, stat) => {
            send('editbox.fileExternalChanged', { path: changedPath, stat });
        }, (deletedPath) => {
            send('editbox.fileDeleted', { path: deletedPath });
        });
    } catch (error) {
        // 监视不可用（如 inotify 名额耗尽）不应中断渲染进程的打开/恢复流程
        console.warn('watchRegister failed:', filePath, error && error.message);
        return { ok: false };
    }
    return { ok: true };
});

ipcMain.handle('editbox.watchUnregister', (_e, filePath) => {
    watcher.unwatchFile(filePath);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// IPC: 备份
// ---------------------------------------------------------------------------
ipcMain.handle('editbox.saveBackup', (_e, payload) => {
    const { path: filePath, content } = payload;
    try {
        const dir = backupDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const backupId = crypto.randomUUID();
        fs.writeFileSync(path.join(dir, backupId + '.txt'), normalizeLf(content), 'utf-8');
        // 清理同名文件的旧备份（path 为 null 的未命名文档按 content 无旧档，不清理）
        if (filePath) {
            for (const name of fs.readdirSync(dir)) {
                if (!name.endsWith('.txt')) continue;
                const metaPath = path.join(dir, name + '.meta');
                if (!fs.existsSync(metaPath)) continue;
                if (fs.readFileSync(metaPath, 'utf-8') === filePath && name !== backupId + '.txt') {
                    fs.unlinkSync(path.join(dir, name));
                    fs.unlinkSync(metaPath);
                }
            }
        }
        if (filePath) {
            fs.writeFileSync(path.join(dir, backupId + '.txt.meta'), filePath, 'utf-8');
        }
        return { ok: true, backupId };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

// ---------------------------------------------------------------------------
// IPC: 会话
// ---------------------------------------------------------------------------
ipcMain.handle('editbox.sessionGet', () => {
    const sessionStore = getStore('session');
    return {
        cleanShutdown: sessionStore.get('cleanShutdown'),
        activeIndex: sessionStore.get('activeIndex') || 0,
        tabs: sessionStore.get('tabs') || []
    };
});

ipcMain.handle('editbox.sessionUpdate', (_e, payload) => {
    const sessionStore = getStore('session');
    const tabs = Array.isArray(payload.tabs) ? payload.tabs : [];
    sessionStore.set('tabs', tabs);
    sessionStore.set('activeIndex', Number(payload.activeIndex) || 0);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// IPC: 缩放 / 关闭
// ---------------------------------------------------------------------------
ipcMain.handle('editbox.zoomGet', () => {
    try {
        const level = getStore('settings').get('zoomLevel');
        return level !== undefined ? parseFloat(level) : 1;
    } catch (error) {
        return 1;
    }
});

ipcMain.handle('editbox.zoomSet', (_e, factor) => {
    const clamped = Math.max(0.5, Math.min(2.0, Number(factor) || 1));
    if (mainWindow) mainWindow.webContents.setZoomFactor(clamped);
    try {
        getStore('settings').set('zoomLevel', clamped);
    } catch (error) { /* 持久化失败不阻断缩放 */ }
    // 通知主窗口状态栏实时跟随（含设置窗口滑杆等其它来源）
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('editbox.zoomChanged', clamped);
    }
    return clamped;
});

ipcMain.handle('editbox.performClose', () => {
    // 正常关闭：保留会话中仍引用的备份（未命名脏文档下次恢复），清理孤儿备份，写 cleanShutdown
    try {
        const sessionStore = getStore('session');
        const tabs = sessionStore.get('tabs') || [];
        const keep = new Set(tabs.filter(t => t.backupId).map(t => t.backupId));
        const dir = backupDir();
        if (fs.existsSync(dir)) {
            for (const name of fs.readdirSync(dir)) {
                if (!name.endsWith('.txt')) continue;
                const id = name.slice(0, -4);
                if (!keep.has(id)) {
                    fs.unlinkSync(path.join(dir, name));
                    const meta = path.join(dir, name + '.meta');
                    if (fs.existsSync(meta)) fs.unlinkSync(meta);
                }
            }
        }
        sessionStore.set('cleanShutdown', true);
    } catch (error) {
        console.error('[cb-editbox] 退出清理失败:', error.message);
    }
    forceClose = true;
    if (mainWindow) mainWindow.close();
    return { ok: true };
});

// ---------------------------------------------------------------------------
// IPC: 设置（独立窗口 + 通用键值）
// ---------------------------------------------------------------------------
ipcMain.handle('editbox.settingsGetAll', () => {
    try {
        return getStore('settings').store || {};
    } catch (error) {
        return {};
    }
});

ipcMain.handle('editbox.settingsSet', (_e, key, value) => {
    try {
        getStore('settings').set(key, value);
        // 语言变更：即时重建原生菜单（无需重启）
        if (key === 'localeMode') rebuildMenu();
        // 通知主窗口应用设置（字体/换行/行号/主题等）
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('editbox.settingApplied', key, value);
        }
    } catch (error) { /* ignore */ }
    return { ok: true };
});

let settingsWindow = null;

function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 720,
        height: 520,
        minWidth: 560,
        minHeight: 420,
        title: 'EditBox - Settings',
        icon: path.join(__dirname, 'public', 'logo.png'),
        parent: mainWindow || undefined,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });
    // 设置窗口无原生菜单（见 rebuildMenu，每次重建菜单后都要重新移除）
    settingsWindow.removeMenu();
    settingsWindow.setMenuBarVisibility(false);
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        settingsWindow.loadURL('http://localhost:5181/#/settings');
    } else {
        settingsWindow.loadFile(path.join(__dirname, 'build', 'index.html'), { hash: '/settings' });
    }
    settingsWindow.on('closed', () => { settingsWindow = null; });
}

ipcMain.handle('editbox.openSettings', () => {
    createSettingsWindow();
    return { ok: true };
});

ipcMain.handle('editbox.closeSettings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
    return { ok: true };
});

ipcMain.handle('editbox.listFonts', async () => {
    try {
        return await listFonts();
    } catch (error) {
        console.error('[cb-editbox] 字体枚举失败:', error.message);
        return [];
    }
});

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function isBoundsOnScreen(bounds) {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    return displays.some(display => {
        const wa = display.workArea;
        const overlapX = Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x);
        const overlapY = Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y);
        return overlapX > 0 && overlapY > 0;
    });
}

// 启动时应用已保存的缩放比例（需在内容加载后应用，否则可能被导航重置）
function applySavedZoom() {
    try {
        const level = parseFloat(getStore('settings').get('zoomLevel'));
        if (!Number.isNaN(level) && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.setZoomFactor(Math.max(0.5, Math.min(2.0, level)));
        }
    } catch (error) { /* 读取失败保持默认缩放 */ }
}

function createWindow() {
    const winStateStore = getStore('winState');
    const savedBounds = winStateStore.get('bounds');
    const valid = savedBounds && isBoundsOnScreen(savedBounds);

    mainWindow = new BrowserWindow({
        width: valid ? savedBounds.width : 1100,
        height: valid ? savedBounds.height : 750,
        x: valid ? savedBounds.x : undefined,
        y: valid ? savedBounds.y : undefined,
        minWidth: 760,
        minHeight: 540,
        resizable: true,
        title: 'EditBox',
        icon: path.join(__dirname, 'public', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5181');
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        });
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }
    mainWindow.webContents.on('did-finish-load', applySavedZoom);

    // 启动即标记"非正常关闭"：本进程内未走到 performClose 就消失 = 崩溃/被杀
    const sessionStore = getStore('session');
    sessionStore.set('cleanShutdown', false);

    // 关闭拦截协议：有脏文档时渲染进程负责确认，确认后调 performClose
    mainWindow.on('close', (event) => {
        if (!forceClose) {
            event.preventDefault();
            winStateStore.set('bounds', mainWindow.getBounds());
            mainWindow.webContents.send('editbox.requestClose');
            return;
        }
        winStateStore.set('bounds', mainWindow.getBounds());
    });

    // 缩放快捷键已由原生菜单 accelerator（CmdOrCtrl+=/-/0）接管
}

// ---------------------------------------------------------------------------
// 原生菜单（File/Edit/Search/View/Language/Options/Help）
// ---------------------------------------------------------------------------
const LANGUAGES = [
    'Plain Text', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'JSON', 'Markdown',
    'Python', 'Go', 'Rust', 'Java', 'C', 'C++', 'C#', 'Shell', 'SQL',
    'YAML', 'XML', 'Vue', 'JSX', 'TSX', 'PHP', 'Ruby', 'Perl', 'Lua', 'R',
    'Dart', 'Kotlin', 'Swift', 'Dockerfile', 'Properties files', 'TOML'
];

function sendAction(action, payload) {
    return () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('editbox.menuAction', action, payload || null);
        }
    };
}

// Markdown 实时渲染开关：菜单点击与渲染进程快捷键共用
function setMarkdownPreview(enabled, syncMenu) {
    const value = !!enabled;
    try {
        getStore('settings').set('markdownLivePreview', value);
    } catch (error) { /* 持久化失败不阻断切换 */ }
    sendAction('view.markdownPreview', value)();
    if (syncMenu) rebuildMenu();
}

ipcMain.handle('editbox.toggleMarkdownPreview', () => {
    const current = getStore('settings').get('markdownLivePreview') !== false; // 默认开
    setMarkdownPreview(!current, true);
    return { ok: true, enabled: !current };
});

// 原生菜单文案（主进程独立维护，含 Alt 助记符 &；& 前字符显示为下划线，括号为字面量）
const MENU_I18N = {
    'zh-CN': {
        file: '文件(&F)(F)', edit: '编辑(&E)(E)', search: '搜索(&S)(S)', view: '视图(&V)(V)',
        language: '语言(&L)(L)', options: '选项(&O)(O)', help: '帮助(&H)(H)',
        new: '新建(&N)', open: '打开...(&O)', save: '保存(&S)', saveAs: '另存为...(&A)',
        recent: '最近打开(&E)', noRecent: '（无最近文件）', clearRecent: '清除最近记录',
        reload: '重新载入(&R)', close: '关闭(&C)', closeOthers: '关闭其他(&T)', closeAll: '全部关闭(&L)',
        exit: '退出(&X)',
        undo: '撤销(&U)', redo: '重做(&R)', cut: '剪切(&T)', copy: '复制(&C)', paste: '粘贴(&P)',
        selectAll: '全选(&A)', spacesToTabs: '空格转 Tab', tabsToSpaces: 'Tab 转空格',
        find: '查找...(&F)', replace: '替换...(&R)',
        zoomIn: '放大(&I)', zoomOut: '缩小(&O)', zoomReset: '重置缩放(&R)',
        wordWrap: '自动换行(&W)', lineNumbers: '显示行号(&L)',
        showWhitespace: '显示空白符(&P)', showEol: '显示换行符(&E)',
        showMinimap: '显示缩略图(&M)',
        markdownPreview: 'Markdown 实时渲染(&M)',
        settings: '设置...(&S)', about: '关于 EditBox(&A)'
    },
    'en-US': {
        file: 'File(&F)(F)', edit: 'Edit(&E)(E)', search: 'Search(&S)(S)', view: 'View(&V)(V)',
        language: 'Language(&L)(L)', options: 'Options(&O)(O)', help: 'Help(&H)(H)',
        new: 'New(&N)', open: 'Open...(&O)', save: 'Save(&S)', saveAs: 'Save As...(&A)',
        recent: 'Recent Files(&E)', noRecent: '(No Recent Files)', clearRecent: 'Clear Recent Files',
        reload: 'Reload(&R)', close: 'Close(&C)', closeOthers: 'Close Others(&T)', closeAll: 'Close All(&L)',
        exit: 'Exit(&X)',
        undo: 'Undo(&U)', redo: 'Redo(&R)', cut: 'Cut(&T)', copy: 'Copy(&C)', paste: 'Paste(&P)',
        selectAll: 'Select All(&A)', spacesToTabs: 'Spaces to Tabs', tabsToSpaces: 'Tabs to Spaces',
        find: 'Find...(&F)', replace: 'Replace...(&R)',
        zoomIn: 'Zoom In(&I)', zoomOut: 'Zoom Out(&O)', zoomReset: 'Reset Zoom(&R)',
        wordWrap: 'Word Wrap(&W)', lineNumbers: 'Show Line Numbers(&L)',
        showWhitespace: 'Show Whitespace(&P)', showEol: 'Show Line Endings(&E)',
        showMinimap: 'Show Minimap(&M)',
        markdownPreview: 'Markdown Live Preview(&M)',
        settings: 'Settings...(&S)', about: 'About EditBox(&A)'
    }
};

// 解析当前界面语言：显式设置优先，system 跟随 app 语言
function resolveLocale() {
    let mode = 'system';
    try {
        mode = getStore('settings').get('localeMode') || 'system';
    } catch (error) { /* ignore */ }
    if (mode === 'zh-CN' || mode === 'en-US') return mode;
    return String(app.getLocale() || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

// 语言分组（与 NotepadNext 一致）：先按名称（忽略大小写）排序，
// 再把首字母相同的连续项合并——仅一项时平铺，≥2 项时收入以该首字母命名的子菜单
function buildLanguageItems() {
    const names = [...LANGUAGES].sort((a, b) => {
        const x = a.toLowerCase();
        const y = b.toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
    });
    const toItem = (name) => ({ label: name, click: sendAction('language.set', name) });
    const items = [];
    let i = 0;
    while (i < names.length) {
        const letter = names[i][0].toUpperCase();
        let j = i;
        while (j < names.length && names[j][0].toUpperCase() === letter) j += 1;
        const group = names.slice(i, j);
        if (group.length === 1) {
            items.push(toItem(group[0]));
        } else {
            items.push({ label: letter, submenu: group.map(toItem) });
        }
        i = j;
    }
    return items;
}

function buildRecentItems(M) {
    const files = readRecentFiles();
    if (files.length === 0) {
        return [{ label: M.noRecent, enabled: false }];
    }
    const items = files.map((filePath) => ({
        label: `${path.basename(filePath)}  —  ${filePath}`.replace(/&/g, '&&'),
        click: sendAction('file.openRecent', filePath)
    }));
    items.push({ type: 'separator' });
    items.push({ label: M.clearRecent, click: clearRecentFiles });
    return items;
}

function buildMenu() {
    const settings = getStore('settings');
    const wordWrap = settings.get('wordWrap') !== false; // 默认开
    const lineNumbers = settings.get('lineNumbers') !== false; // 默认开
    const showWhitespace = settings.get('showWhitespace') === true;
    const showEol = settings.get('showEol') === true;
    const showMinimap = settings.get('showMinimap') === true;
    const markdownPreview = settings.get('markdownLivePreview') !== false; // 默认开
    const M = MENU_I18N[resolveLocale()];

    const template = [
        {
            label: M.file,
            submenu: [
                { label: M.new, accelerator: 'CmdOrCtrl+N', click: sendAction('file.new') },
                { label: M.open, accelerator: 'CmdOrCtrl+O', click: sendAction('file.open') },
                { label: M.recent, submenu: buildRecentItems(M) },
                { type: 'separator' },
                { label: M.save, accelerator: 'CmdOrCtrl+S', click: sendAction('file.save') },
                { label: M.saveAs, accelerator: 'CmdOrCtrl+Shift+S', click: sendAction('file.saveAs') },
                { label: M.reload, click: sendAction('file.reload') },
                { type: 'separator' },
                { label: M.close, accelerator: 'CmdOrCtrl+W', click: sendAction('file.close') },
                { label: M.closeOthers, click: sendAction('file.closeOthers') },
                { label: M.closeAll, click: sendAction('file.closeAll') },
                { type: 'separator' },
                { label: M.exit, accelerator: 'CmdOrCtrl+Q', click: sendAction('file.exit') }
            ]
        },
        {
            label: M.edit,
            submenu: [
                { label: M.undo, accelerator: 'CmdOrCtrl+Z', click: sendAction('edit.undo') },
                { label: M.redo, accelerator: 'CmdOrCtrl+Y', click: sendAction('edit.redo') },
                { type: 'separator' },
                { label: M.cut, accelerator: 'CmdOrCtrl+X', click: sendAction('edit.cut') },
                { label: M.copy, accelerator: 'CmdOrCtrl+C', click: sendAction('edit.copy') },
                { label: M.paste, accelerator: 'CmdOrCtrl+V', click: sendAction('edit.paste') },
                { type: 'separator' },
                { label: M.selectAll, accelerator: 'CmdOrCtrl+A', click: sendAction('edit.selectAll') },
                { type: 'separator' },
                { label: M.spacesToTabs, click: sendAction('edit.spacesToTabs') },
                { label: M.tabsToSpaces, click: sendAction('edit.tabsToSpaces') }
            ]
        },
        {
            label: M.search,
            submenu: [
                { label: M.find, accelerator: 'CmdOrCtrl+F', click: sendAction('search.find') },
                { label: M.replace, accelerator: 'CmdOrCtrl+H', click: sendAction('search.replace') }
            ]
        },
        {
            label: M.view,
            submenu: [
                { label: M.zoomIn, accelerator: 'CmdOrCtrl+=', click: sendAction('view.zoomIn') },
                { label: M.zoomOut, accelerator: 'CmdOrCtrl+-', click: sendAction('view.zoomOut') },
                { label: M.zoomReset, accelerator: 'CmdOrCtrl+0', click: sendAction('view.zoomReset') },
                { type: 'separator' },
                {
                    label: M.wordWrap, type: 'checkbox', checked: wordWrap,
                    accelerator: 'Alt+Z',
                    click: (item) => {
                        getStore('settings').set('wordWrap', item.checked);
                        sendAction('view.wordWrap', item.checked)();
                    }
                },
                {
                    label: M.lineNumbers, type: 'checkbox', checked: lineNumbers,
                    click: (item) => {
                        getStore('settings').set('lineNumbers', item.checked);
                        sendAction('view.lineNumbers', item.checked)();
                    }
                },
                {
                    label: M.showWhitespace, type: 'checkbox', checked: showWhitespace,
                    click: (item) => {
                        getStore('settings').set('showWhitespace', item.checked);
                        sendAction('view.showWhitespace', item.checked)();
                    }
                },
                {
                    label: M.showEol, type: 'checkbox', checked: showEol,
                    click: (item) => {
                        getStore('settings').set('showEol', item.checked);
                        sendAction('view.showEol', item.checked)();
                    }
                },
                {
                    label: M.showMinimap, type: 'checkbox', checked: showMinimap,
                    click: (item) => {
                        getStore('settings').set('showMinimap', item.checked);
                        sendAction('view.showMinimap', item.checked)();
                    }
                },
                { type: 'separator' },
                {
                    // 快捷键由渲染进程的编辑器键位处理：
                    // CodeMirror 会 preventDefault，原生菜单加速键永远收不到，
                    // 因此这里不注册 accelerator，仅把快捷键显示在菜单文案里
                    label: `${M.markdownPreview}  ${process.platform === 'darwin' ? 'Cmd+Shift+M' : 'Ctrl+Shift+M'}`,
                    type: 'checkbox', checked: markdownPreview,
                    click: (item) => setMarkdownPreview(item.checked, false)
                }
            ]
        },
        {
            label: M.language,
            submenu: buildLanguageItems()
        },
        {
            label: M.options,
            submenu: [
                { label: M.settings, accelerator: 'CmdOrCtrl+,', click: sendAction('options.settings') }
            ]
        },
        {
            label: M.help,
            submenu: [
                { label: M.about, click: sendAction('help.about') }
            ]
        }
    ];

    return Menu.buildFromTemplate(template);
}

function rebuildMenu() {
    // setApplicationMenu 会把菜单应用到所有窗口，需重新移除设置窗口的菜单
    Menu.setApplicationMenu(buildMenu());
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.removeMenu();
        settingsWindow.setMenuBarVisibility(false);
    }
}

function registerMediaProtocol() {
    protocol.handle('editbox-media', async (request) => {
        try {
            const target = new URL(request.url).searchParams.get('p');
            if (!target) return new Response('Bad Request', { status: 400 });
            const filePath = path.resolve(target);
            if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
                return new Response('Forbidden', { status: 403 });
            }
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) return new Response('Not Found', { status: 404 });
            return await net.fetch(pathToFileURL(filePath).toString());
        } catch (error) {
            return new Response('Not Found', { status: 404 });
        }
    });
}

app.whenReady().then(() => {
    registerMediaProtocol();
    rebuildMenu();
    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
