/**
 * cb-editbox/lib/watcher.js — 文件外部修改监视
 *
 * 以"目录级 fs.watch + 文件 stat 基线比对"实现：
 *   - 目录级监听对 inode 替换（编辑器原子写、git checkout）稳定；
 *   - 基线 = 主进程最后一次写盘或 openFile 时记录的 {mtimeMs, size}；
 *   - stat 与基线一致 → 自身写入或无关事件，忽略；不一致 → 外部修改，
 *     更新基线并回调通知；
 *   - stat 失败后再确认一次（防原子替换中间态误报），仍不存在 → 删除通知。
 */
const fs = require('fs');
const path = require('path');

// 删除确认延迟：避开"临时文件 + rename 覆盖"等瞬时不可见窗口
const DELETE_CONFIRM_DELAY = 250;

// dir → { watcher, refCount }
const _dirWatchers = new Map();
// filePath → { mtimeMs, size, deleted, onExternal, onDeleted }
const _baselines = new Map();
// filePath → 删除确认定时器
const _deleteTimers = new Map();

function ensureDirWatcher(dir) {
    let entry = _dirWatchers.get(dir);
    if (entry) {
        entry.refCount++;
        return;
    }
    const watcher = fs.watch(dir, { persistent: false }, () => {
        handleDirEvent(dir);
    });
    _dirWatchers.set(dir, { watcher, refCount: 1 });
}

function releaseDirWatcher(dir) {
    const entry = _dirWatchers.get(dir);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
        try { entry.watcher.close(); } catch (e) { /* 已关闭则忽略 */ }
        _dirWatchers.delete(dir);
    }
}

function handleDirEvent(dir) {
    for (const [filePath, baseline] of _baselines) {
        if (path.dirname(filePath) !== dir) continue;
        let stat = null;
        try {
            stat = fs.statSync(filePath);
        } catch (e) {
            stat = null;
        }
        if (!stat) {
            scheduleDeleteCheck(filePath);
            continue;
        }
        clearDeleteCheck(filePath);
        // 文件重新出现（此前已判定删除）：按外部修改处理
        if (baseline.deleted) {
            baseline.deleted = false;
            baseline.mtimeMs = stat.mtimeMs;
            baseline.size = stat.size;
            notifyExternal(baseline, filePath, stat);
            continue;
        }
        if (stat.mtimeMs === baseline.mtimeMs && stat.size === baseline.size) continue;
        baseline.mtimeMs = stat.mtimeMs;
        baseline.size = stat.size;
        notifyExternal(baseline, filePath, stat);
    }
}

function notifyExternal(baseline, filePath, stat) {
    try {
        baseline.onExternal(filePath, { mtimeMs: stat.mtimeMs, size: stat.size });
    } catch (e) { /* 回调异常不中断 watcher */ }
}

// stat 失败不能立即断言删除（原子替换、重命名过程会短暂不可见），
// 延迟复查；仍不存在才通知，且同一次删除只通知一次。
function scheduleDeleteCheck(filePath) {
    const baseline = _baselines.get(filePath);
    if (!baseline || baseline.deleted || _deleteTimers.has(filePath)) return;
    const timer = setTimeout(() => {
        _deleteTimers.delete(filePath);
        const entry = _baselines.get(filePath);
        if (!entry || entry.deleted) return;
        if (fs.existsSync(filePath)) return; // 已恢复，交给后续目录事件处理
        entry.deleted = true;
        try {
            entry.onDeleted(filePath);
        } catch (e) { /* 回调异常不中断 watcher */ }
    }, DELETE_CONFIRM_DELAY);
    _deleteTimers.set(filePath, timer);
}

function clearDeleteCheck(filePath) {
    const timer = _deleteTimers.get(filePath);
    if (!timer) return;
    clearTimeout(timer);
    _deleteTimers.delete(filePath);
}

/**
 * 登记监视一个文件
 * @param {string} filePath 绝对路径
 * @param {{mtimeMs:number, size:number}} baseline 初始基线
 * @param {(filePath:string, stat:{mtimeMs:number,size:number})=>void} onExternal 外部修改回调
 * @param {(filePath:string)=>void} [onDeleted] 文件被删除回调
 */
function watchFile(filePath, baseline, onExternal, onDeleted) {
    const existed = _baselines.has(filePath);
    _baselines.set(filePath, {
        mtimeMs: baseline.mtimeMs,
        size: baseline.size,
        deleted: false,
        onExternal,
        onDeleted: onDeleted || (() => {})
    });
    // 重复登记（另存为到已监视路径等）不重复增加目录监听引用
    if (!existed) ensureDirWatcher(path.dirname(filePath));
}

/** 主进程写盘成功后调用：把基线刷新为新 stat，避免自身写入被当成外部修改 */
function updateBaseline(filePath, stat) {
    const baseline = _baselines.get(filePath);
    if (baseline) {
        baseline.mtimeMs = stat.mtimeMs;
        baseline.size = stat.size;
        baseline.deleted = false;
        clearDeleteCheck(filePath);
    }
}

function unwatchFile(filePath) {
    if (!_baselines.has(filePath)) return;
    clearDeleteCheck(filePath);
    _baselines.delete(filePath);
    releaseDirWatcher(path.dirname(filePath));
}

module.exports = { watchFile, unwatchFile, updateBaseline };
