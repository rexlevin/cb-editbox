/**
 * cb-editbox/lib/workspace.js — 工作区索引管理器
 *
 * 职责：
 *   - 校验并打开一个本地目录作为单根工作区；
 *   - 异步建立文件索引（相对路径、文件名、小写扩展名），不读取文件内容；
 *   - 应用内置忽略目录、二进制扩展名、符号链接跳过与上限截断；
 *   - 扫描完成后通过 onIndexUpdated 广播快照，通过 onChanged 广播元信息变化。
 *
 * 说明：
 *   - 路径统一以 / 分隔存储，展示与读取时由 Node path API 处理；
 *   - 单窗口应用只持有一个实例，因此管理器只维护一份活动工作区状态。
 */
const fs = require('fs');
const path = require('path');

const MAX_FILES = 20000;
const MAX_DIRS = 5000;
const MAX_DEPTH = 20;
const MAX_DURATION_MS = 5000;
const SCAN_YIELD_EVERY = 500;

const IGNORED_DIRS = new Set([
    '.git', '.svn', '.hg', 'node_modules', 'bower_components',
    'dist', 'build', 'out', 'target', 'coverage',
    '.cache', '.next', '.nuxt', '.parcel-cache',
    '__pycache__', '.venv', 'venv', '.tox',
    'vendor', 'pods', 'deriveddata'
].map((name) => name.toLowerCase()));

const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
    '.zip', '.gz', '.bz2', '.xz', '.7z', '.rar', '.tar',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.jar', '.war',
    '.mp3', '.mp4', '.wav', '.flac', '.avi', '.mkv', '.mov', '.webm',
    '.ttf', '.otf', '.woff', '.woff2',
    '.db', '.sqlite', '.sqlite3'
]);

function toPosix(value) {
    return String(value).replace(/\\/g, '/');
}

function normalizeRoot(root) {
    return toPosix(path.resolve(String(root)));
}

function relOf(root, full) {
    return toPosix(path.relative(root, full));
}

function isInsideRoot(root, full) {
    const rel = path.relative(root, full);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function createWorkspaceManager({ onChanged, onIndexUpdated } = {}) {
    let meta = null;
    let files = [];
    let dirCount = 0;
    let revision = 0;
    let scanning = false;
    let truncated = false;
    let error = null;
    let generation = 0;

    function lightIndex() {
        return { revision, scanning, truncated, fileCount: files.length, dirCount, error };
    }

    function fullIndex() {
        return { ...lightIndex(), files: files.slice() };
    }

    function emitChanged() {
        try {
            if (onChanged) onChanged(meta ? { ...meta } : null);
        } catch (err) { /* 广播失败不影响主流程 */ }
    }

    function emitIndex() {
        try {
            if (onIndexUpdated) onIndexUpdated(fullIndex());
        } catch (err) { /* 广播失败不影响主流程 */ }
    }

    function resetIndex() {
        files = [];
        dirCount = 0;
        truncated = false;
        error = null;
        scanning = false;
    }

    async function scan(root) {
        const gen = generation;
        const startedAt = Date.now();
        const nextFiles = [];
        let nextDirs = 0;
        let nextTruncated = false;
        const queue = [{ dir: root, depth: 0 }];
        let processed = 0;

        outer:
        while (queue.length > 0) {
            if (gen !== generation) return null;
            if (Date.now() - startedAt > MAX_DURATION_MS) {
                nextTruncated = true;
                break;
            }
            const current = queue.shift();
            let entries = [];
            try {
                entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
            } catch (err) {
                if (current.depth === 0) return { error: 'ROOT_UNREADABLE' };
                continue;
            }
            entries.sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                if (gen !== generation) return null;
                processed += 1;
                if (processed % SCAN_YIELD_EVERY === 0) {
                    await new Promise((resolve) => setImmediate(resolve));
                    if (gen !== generation) return null;
                }
                if (entry.isSymbolicLink()) continue;
                const full = path.join(current.dir, entry.name);
                if (entry.isDirectory()) {
                    if (IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
                    if (current.depth + 1 > MAX_DEPTH) continue;
                    nextDirs += 1;
                    if (nextDirs >= MAX_DIRS) {
                        nextTruncated = true;
                        break outer;
                    }
                    queue.push({ dir: full, depth: current.depth + 1 });
                    continue;
                }
                if (!entry.isFile()) continue;
                const ext = path.extname(entry.name).toLowerCase();
                if (BINARY_EXTENSIONS.has(ext)) continue;
                nextFiles.push({
                    path: toPosix(full),
                    rel: relOf(root, full),
                    name: entry.name,
                    ext
                });
                if (nextFiles.length >= MAX_FILES) {
                    nextTruncated = true;
                    break outer;
                }
            }
        }

        if (gen !== generation) return null;
        return { files: nextFiles, dirCount: nextDirs, truncated: nextTruncated };
    }

    async function startScan() {
        if (!meta) return;
        const gen = ++generation;
        scanning = true;
        error = null;
        revision += 1;
        emitIndex();

        const result = await scan(meta.root);
        if (result === null || gen !== generation) return;
        if (result.error) {
            scanning = false;
            error = result.error;
            revision += 1;
            emitIndex();
            return;
        }
        files = result.files;
        dirCount = result.dirCount;
        truncated = result.truncated;
        scanning = false;
        error = null;
        revision += 1;
        emitIndex();
    }

    function open(root) {
        if (typeof root !== 'string' || !root.trim()) return { ok: false, error: 'INVALID_ROOT' };
        const normalized = normalizeRoot(root);
        let stat = null;
        try {
            stat = fs.statSync(normalized);
        } catch (err) {
            return { ok: false, error: 'NOT_FOUND' };
        }
        if (!stat.isDirectory()) return { ok: false, error: 'NOT_DIRECTORY' };
        try {
            fs.accessSync(normalized, fs.constants.R_OK);
        } catch (err) {
            return { ok: false, error: 'NOT_READABLE' };
        }

        if (meta && meta.root === normalized) {
            startScan();
            return { ok: true, meta: { ...meta } };
        }

        generation += 1;
        meta = { root: normalized, name: path.basename(normalized), openedAt: Date.now() };
        resetIndex();
        revision += 1;
        emitChanged();
        emitIndex();
        startScan();
        return { ok: true, meta: { ...meta } };
    }

    function close() {
        generation += 1;
        meta = null;
        resetIndex();
        revision += 1;
        emitChanged();
        emitIndex();
        return { ok: true };
    }

    function refresh() {
        if (!meta) return { ok: false };
        startScan();
        return { ok: true };
    }

    function upsert(filePath) {
        if (!meta || typeof filePath !== 'string') return false;
        const normalized = toPosix(path.resolve(filePath));
        if (!isInsideRoot(meta.root, normalized)) return false;
        if (files.some((item) => item.path === normalized)) return false;
        const ext = path.extname(normalized).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) return false;
        const rel = relOf(meta.root, normalized);
        const parts = rel.split('/').slice(0, -1);
        if (parts.some((seg) => IGNORED_DIRS.has(seg.toLowerCase()))) return false;
        files.push({ path: normalized, rel, name: path.basename(normalized), ext });
        revision += 1;
        emitIndex();
        return true;
    }

    function getState() {
        return { meta: meta ? { ...meta } : null, index: lightIndex() };
    }

    function getIndex() {
        return fullIndex();
    }

    function getMeta() {
        return meta ? { ...meta } : null;
    }

    return { open, close, refresh, upsert, getState, getIndex, getMeta };
}

module.exports = {
    createWorkspaceManager,
    MAX_FILES,
    MAX_DIRS,
    MAX_DEPTH,
    MAX_DURATION_MS,
    SCAN_YIELD_EVERY,
    IGNORED_DIRS,
    BINARY_EXTENSIONS
};
