/**
 * cb-editbox/lib/projects.js — 项目（保存的工作目录）存储
 *
 * 项目 = 一个被用户显式保存的目录快捷方式，不记录打开的文件、标签顺序或窗口布局。
 * 持久化：canbox-core store 名为 projects，键为 items（Project[]，上限 200）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_LIMIT = 200;
const NAME_MAX = 60;

function toPosix(value) {
    return String(value).replace(/\\/g, '/');
}

function normalizeName(name, fallback) {
    const raw = name === undefined || name === null ? '' : String(name);
    const value = raw.trim();
    return (value || String(fallback || '')).slice(0, NAME_MAX);
}

function createProjects(getStore) {
    function read() {
        const items = getStore().get('items');
        return Array.isArray(items) ? items : [];
    }

    function write(items) {
        getStore().set('items', items);
    }

    function sortItems(items) {
        return items.slice().sort((a, b) => {
            const lastA = Number(a.lastOpenedAt) || 0;
            const lastB = Number(b.lastOpenedAt) || 0;
            if (lastA !== lastB) return lastB - lastA;
            return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
        });
    }

    function exists(root) {
        try {
            return fs.statSync(root).isDirectory();
        } catch (err) {
            return false;
        }
    }

    function list() {
        const items = sortItems(read()).map((project) => ({ ...project, exists: exists(project.root) }));
        return { ok: true, items };
    }

    function save({ root, name } = {}) {
        if (typeof root !== 'string' || !root.trim()) return { ok: false, error: 'INVALID_ROOT' };
        const normalized = toPosix(path.resolve(root));
        let stat = null;
        try {
            stat = fs.statSync(normalized);
        } catch (err) {
            return { ok: false, error: 'NOT_FOUND' };
        }
        if (!stat.isDirectory()) return { ok: false, error: 'NOT_DIRECTORY' };

        const items = read();
        const existing = items.find((project) => toPosix(project.root) === normalized);
        if (existing) {
            return { ok: true, project: { ...existing, exists: true }, created: false };
        }
        if (items.length >= PROJECT_LIMIT) return { ok: false, limit: true };

        const project = {
            id: crypto.randomUUID(),
            name: normalizeName(name, path.basename(normalized)),
            root: normalized,
            createdAt: Date.now(),
            lastOpenedAt: null
        };
        items.push(project);
        write(items);
        return { ok: true, project: { ...project, exists: true }, created: true };
    }

    function open(id) {
        const items = read();
        const project = items.find((item) => item.id === id);
        if (!project) return { ok: false, error: 'NOT_FOUND' };
        if (!exists(project.root)) return { ok: false, missing: true, project: { ...project } };
        project.lastOpenedAt = Date.now();
        write(items);
        return { ok: true, root: project.root, project: { ...project, exists: true } };
    }

    function remove(id) {
        const items = read();
        const next = items.filter((item) => item.id !== id);
        if (next.length === items.length) return { ok: false, error: 'NOT_FOUND' };
        write(next);
        return { ok: true };
    }

    function rename(id, name) {
        const nextName = normalizeName(name, '');
        if (!nextName) return { ok: false, error: 'INVALID_NAME' };
        const items = read();
        const project = items.find((item) => item.id === id);
        if (!project) return { ok: false, error: 'NOT_FOUND' };
        project.name = nextName;
        write(items);
        return { ok: true, project: { ...project, exists: exists(project.root) } };
    }

    return { list, save, open, remove, rename };
}

module.exports = { createProjects, PROJECT_LIMIT, NAME_MAX };
