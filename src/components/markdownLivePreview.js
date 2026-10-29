/**
 * Markdown 实时渲染
 *
 * 设计原则：文档始终是 Markdown 源码，本扩展只叠加展示装饰，不修改任何字符。
 * - 光标/选区所在行保持源码原样（Typora 式），其余行隐藏语法标记并渲染样式；
 * - 查找/替换有命中时，命中行自动展开源码，避免标记被隐藏后无法定位；
 * - 只遍历可视区域，避免大文档全量扫描；
 * - 表格与公式保留源码，在源码下方追加块级渲染预览（双显），源码变化即同步；
 * - 任务列表渲染为复选框，点击直接改写文档中的 [ ] / [x]；
 * - 链接 Ctrl+Click 调用系统浏览器打开。
 *
 * 支持范围：标题、粗体、斜体、删除线、行内代码、链接、引用、代码块底色、
 * 图片、分隔线、列表符号、表格、公式、任务列表。
 */
import { syntaxTree, language } from '@codemirror/language';
import { Decoration, ViewPlugin, WidgetType, EditorView } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import { getSearchQuery, searchPanelOpen } from '@codemirror/search';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const HIDE = Decoration.replace({});

const MARK_STRONG = Decoration.mark({ class: 'md-strong' });
const MARK_EM = Decoration.mark({ class: 'md-em' });
const MARK_STRIKE = Decoration.mark({ class: 'md-strike' });
const MARK_CODE = Decoration.mark({ class: 'md-code' });

const LINE_HEADING = [
    null,
    Decoration.line({ class: 'md-h1' }),
    Decoration.line({ class: 'md-h2' }),
    Decoration.line({ class: 'md-h3' }),
    Decoration.line({ class: 'md-h4' }),
    Decoration.line({ class: 'md-h5' }),
    Decoration.line({ class: 'md-h6' })
];
const LINE_QUOTE = Decoration.line({ class: 'md-quote' });
const LINE_CODEBLOCK = Decoration.line({ class: 'md-codeblock' });

// ---------------------------------------------------------------------------
// HTML 工具
// ---------------------------------------------------------------------------
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 单元格内的轻量行内标记（先转义再加标签，避免注入）
function renderInline(text) {
    let h = escapeHtml(text);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
        '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    return h;
}

// ---------------------------------------------------------------------------
// 表格解析（GFM）：首行为表头，次行为对齐分隔行，其余为数据行
// ---------------------------------------------------------------------------
function splitRow(text) {
    let s = text.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '';
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (ch === '\\' && s[i + 1] === '|') {
            cur += '|';
            i += 1;
            continue;
        }
        if (ch === '|') {
            cells.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    cells.push(cur.trim());
    return cells;
}

function alignOf(cell) {
    const t = cell.trim();
    const left = t.startsWith(':');
    const right = t.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
}

function isDelimiterRow(cells) {
    return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function renderTableHtml(source) {
    const rows = source.split('\n').map(splitRow);
    const header = rows[0] || [];
    const aligns = (rows[1] || []).map(alignOf);
    const body = rows.slice(2);
    const cols = header.length;

    const cell = (content, tag, align) => {
        const style = align ? ` style="text-align:${align}"` : '';
        return `<${tag}${style}>${renderInline(content || '')}</${tag}>`;
    };

    const head = '<thead><tr>' + header
        .map((c, i) => cell(c, 'th', aligns[i]))
        .join('') + '</tr></thead>';

    const bodyHtml = body.length === 0 ? '' : '<tbody>' + body.map((row) => {
        const cells = [];
        for (let i = 0; i < cols; i += 1) cells.push(cell(row[i], 'td', aligns[i]));
        return '<tr>' + cells.join('') + '</tr>';
    }).join('') + '</tbody>';

    return `<table class="md-table">${head}${bodyHtml}</table>`;
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------
class HrWidget extends WidgetType {
    eq() { return true; }
    ignoreEvent() { return true; }
    toDOM() {
        const el = document.createElement('div');
        el.className = 'md-hr';
        return el;
    }
}

class ImageWidget extends WidgetType {
    constructor(src, alt) {
        super();
        this.src = src;
        this.alt = alt;
    }
    eq(other) { return other.src === this.src && other.alt === this.alt; }
    ignoreEvent() { return true; }
    toDOM() {
        const img = document.createElement('img');
        img.className = 'md-img';
        img.src = this.src;
        img.alt = this.alt;
        img.loading = 'lazy';
        return img;
    }
}

// 独立成行的图片：源码行保留，下方追加渲染结果（与表格/公式一致的双显）
class ImageBlockWidget extends WidgetType {
    constructor(src, alt) {
        super();
        this.src = src;
        this.alt = alt;
    }
    eq(other) { return other.src === this.src && other.alt === this.alt; }
    ignoreEvent() { return true; }
    toDOM() {
        const wrap = document.createElement('div');
        wrap.className = 'md-img-preview';
        const img = document.createElement('img');
        img.className = 'md-img';
        img.src = this.src;
        img.alt = this.alt;
        img.loading = 'lazy';
        wrap.appendChild(img);
        return wrap;
    }
}

class BulletWidget extends WidgetType {
    eq() { return true; }
    ignoreEvent() { return true; }
    toDOM() {
        const el = document.createElement('span');
        el.className = 'md-bullet';
        el.textContent = '•';
        return el;
    }
}

// 任务列表复选框：点击由 domEventHandlers 接管（ignoreEvent 必须为 false）
class TaskCheckboxWidget extends WidgetType {
    constructor(checked, from, to) {
        super();
        this.checked = checked;
        this.from = from;
        this.to = to;
    }
    eq(other) {
        return other.checked === this.checked && other.from === this.from && other.to === this.to;
    }
    ignoreEvent() { return false; }
    toDOM() {
        const el = document.createElement('span');
        el.className = 'md-task-checkbox' + (this.checked ? ' is-checked' : '');
        el.setAttribute('role', 'checkbox');
        el.setAttribute('aria-checked', this.checked ? 'true' : 'false');
        el.setAttribute('data-from', String(this.from));
        el.setAttribute('data-to', String(this.to));
        el.textContent = this.checked ? '✓' : '';
        return el;
    }
}

class TableWidget extends WidgetType {
    constructor(source) {
        super();
        this.source = source;
    }
    eq(other) { return other.source === this.source; }
    ignoreEvent() { return true; }
    toDOM() {
        const el = document.createElement('div');
        el.className = 'md-table-preview';
        el.innerHTML = renderTableHtml(this.source);
        return el;
    }
}

class MathWidget extends WidgetType {
    constructor(tex) {
        super();
        this.tex = tex;
    }
    eq(other) { return other.tex === this.tex; }
    ignoreEvent() { return true; }
    toDOM() {
        const el = document.createElement('div');
        el.className = 'md-math-preview';
        try {
            el.innerHTML = katex.renderToString(this.tex, {
                displayMode: true,
                throwOnError: false
            });
        } catch (e) {
            el.textContent = this.tex;
        }
        return el;
    }
}

// ---------------------------------------------------------------------------
// 图片地址解析：相对路径按当前文件所在目录解析，交给主进程自定义协议读取
// ---------------------------------------------------------------------------
function normalizePath(p) {
    const src = p.replace(/\\/g, '/');
    const drive = /^[A-Za-z]:/.exec(src);
    const prefix = drive ? drive[0] : '';
    const rest = drive ? src.slice(2) : src;
    const parts = rest.split('/');
    const out = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') out.pop();
        else out.push(part);
    }
    return prefix + '/' + out.join('/');
}

function resolveImageUrl(raw, filePath) {
    let src = raw.trim();
    if (/^(?:https?:|data:|editbox-media:|file:|blob:)/i.test(src)) return src;
    try { src = decodeURI(src); } catch (e) { /* 保留原样 */ }
    // 绝对路径不依赖文件位置，未保存的新标签页也能直接渲染
    const absolute = src.startsWith('/') || /^[A-Za-z]:/.test(src);
    if (!absolute && !filePath) return src;
    const dir = filePath ? filePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '') : '';
    const abs = absolute ? src : dir + '/' + src;
    return 'editbox-media://local/?p=' + encodeURIComponent(normalizePath(abs));
}

// ---------------------------------------------------------------------------
// 通用文本工具
// ---------------------------------------------------------------------------
// 取出节点去掉首尾语法标记后的内容区间（用于给正文加样式）
function innerRange(ref, markerNames) {
    let from = ref.from;
    let to = ref.to;
    let child = ref.node.firstChild;
    while (child) {
        if (markerNames.includes(child.type.name)) {
            if (child.from <= from) from = Math.max(from, child.to);
            if (child.to >= to) to = Math.min(to, child.from);
        }
        child = child.nextSibling;
    }
    return { from, to };
}

// 从 ![alt](url "title") 中提取纯地址
function parseUrl(raw) {
    let url = raw.trim().replace(/^<|>$/g, '');
    const space = url.search(/\s/);
    if (space !== -1) url = url.slice(0, space);
    return url;
}

// 语法标记后紧跟的空格一并隐藏，避免标题/引用左侧残留空隙
function extraSpaceEnd(doc, pos) {
    return pos < doc.length && doc.sliceString(pos, pos + 1) === ' ' ? pos + 1 : pos;
}

// ---------------------------------------------------------------------------
// 行内 / 行装饰（ViewPlugin）
// ---------------------------------------------------------------------------
function buildDecorations(view, getFilePath) {
    const { state } = view;
    const doc = state.doc;

    // 选区覆盖的所有行：这些行保持源码，不隐藏语法
    const activeLines = new Set();
    for (const range of state.selection.ranges) {
        const first = doc.lineAt(range.from).number;
        const last = doc.lineAt(range.to).number;
        for (let n = first; n <= last; n++) activeLines.add(n);
    }

    // 查找/替换有命中时，命中行同样展开源码（避免标记隐藏后难以定位）
    if (searchPanelOpen(state)) {
        try {
            const query = getSearchQuery(state);
            for (const range of view.visibleRanges) {
                const cursor = query.getCursor(state, range.from, range.to);
                for (let next = cursor.next(); !next.done; next = cursor.next()) {
                    activeLines.add(doc.lineAt(next.value.from).number);
                }
            }
        } catch (e) { /* 非法正则等异常时不影响渲染 */ }
    }

    const items = [];
    const seenLines = new Set();

    const addLine = (pos, deco) => {
        const line = doc.lineAt(pos);
        if (seenLines.has(line.from)) return;
        seenLines.add(line.from);
        items.push(deco.range(line.from));
    };

    const addLineRange = (fromPos, toPos, deco) => {
        const first = doc.lineAt(fromPos).number;
        const last = doc.lineAt(toPos).number;
        for (let n = first; n <= last; n++) addLine(doc.line(n).from, deco);
    };

    const isActive = (fromPos, toPos) => {
        const first = doc.lineAt(fromPos).number;
        const last = doc.lineAt(toPos).number;
        for (let n = first; n <= last; n++) if (activeLines.has(n)) return true;
        return false;
    };

    for (const { from, to } of view.visibleRanges) {
        const tree = syntaxTree(state);
        tree.iterate({
            from,
            to,
            enter: (node) => {
                const name = node.name;

                // 标题：始终放大显示，语法标记在非光标行隐藏
                const atx = /^ATXHeading([1-6])$/.exec(name);
                if (atx) {
                    addLine(node.from, LINE_HEADING[Number(atx[1])]);
                    return;
                }
                if (name === 'SetextHeading1' || name === 'SetextHeading2') {
                    addLine(node.from, LINE_HEADING[name === 'SetextHeading1' ? 1 : 2]);
                    return;
                }
                if (name === 'HeaderMark') {
                    if (!isActive(node.from, node.to)) items.push(HIDE.range(node.from, extraSpaceEnd(doc, node.to)));
                    return;
                }

                // 引用块：整块加左边框，隐藏 > 标记
                if (name === 'Blockquote') {
                    addLineRange(Math.max(node.from, from), Math.min(node.to - 1, to), LINE_QUOTE);
                    return;
                }
                if (name === 'QuoteMark') {
                    if (!isActive(node.from, node.to)) items.push(HIDE.range(node.from, extraSpaceEnd(doc, node.to)));
                    return;
                }

                // 代码块：整块加底色并隐藏围栏标记（光标在块内时连围栏一起显示）
                if (name === 'FencedCode' || name === 'CodeBlock') {
                    addLineRange(Math.max(node.from, from), Math.min(node.to - 1, to), LINE_CODEBLOCK);
                    return;
                }
                if (name === 'CodeMark' || name === 'CodeInfo') {
                    if (!isActive(node.from, node.to)) items.push(HIDE.range(node.from, node.to));
                    return;
                }

                // 粗体 / 斜体 / 删除线
                if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
                    const deco = name === 'StrongEmphasis' ? MARK_STRONG
                        : name === 'Emphasis' ? MARK_EM : MARK_STRIKE;
                    const inner = innerRange(node, ['EmphasisMark', 'StrikethroughMark']);
                    if (inner.from < inner.to) items.push(deco.range(inner.from, inner.to));
                    return;
                }
                if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
                    if (!isActive(node.from, node.to)) items.push(HIDE.range(node.from, node.to));
                    return;
                }

                // 行内代码
                if (name === 'InlineCode') {
                    const inner = innerRange(node, ['CodeMark']);
                    if (inner.from < inner.to) items.push(MARK_CODE.range(inner.from, inner.to));
                    return;
                }

                // 链接与图片：手动处理整段，跳过子节点
                if (name === 'Link' || name === 'Image') {
                    const raw = doc.sliceString(node.from, node.to);
                    const split = raw.indexOf('](');
                    if (split === -1) return false;
                    const url = parseUrl(raw.slice(split + 2, raw.length - 1));
                    const active = isActive(node.from, node.to);
                    if (name === 'Image') {
                        // 独立成行的图片由块级预览负责（源码 + 下方渲染图），避免重复显示
                        const standalone = STANDALONE_IMAGE_LINE.test(doc.lineAt(node.from).text);
                        if (!active && url && !standalone) {
                            const alt = raw.slice(2, split);
                            items.push(Decoration.replace({
                                widget: new ImageWidget(resolveImageUrl(url, getFilePath()), alt)
                            }).range(node.from, node.to));
                        }
                        return false;
                    }
                    const innerFrom = node.from + (raw.startsWith('![') ? 2 : 1);
                    const innerTo = node.from + split;
                    if (innerFrom < innerTo && url) {
                        // data-href 供 Ctrl+Click 打开外部浏览器使用
                        items.push(Decoration.mark({
                            class: 'md-link',
                            attributes: { 'data-href': url }
                        }).range(innerFrom, innerTo));
                    }
                    if (!active) {
                        items.push(HIDE.range(node.from, innerFrom));
                        items.push(HIDE.range(node.from + split, node.to));
                    }
                    return false;
                }

                // 分隔线：非光标行整行替换为横线
                // 注意：CM6 不允许插件提供 block 装饰，这里用普通替换 + 块级样式实现
                if (name === 'HorizontalRule') {
                    const line = doc.lineAt(node.from);
                    if (!activeLines.has(line.number)) {
                        items.push(Decoration.replace({ widget: new HrWidget() })
                            .range(line.from, line.to));
                    }
                    return false;
                }

                // 列表符号替换为圆点，有序列表保持源码（避免编号错乱）
                if (name === 'ListMark') {
                    if (!isActive(node.from, node.to)) {
                        const raw = doc.sliceString(node.from, node.to);
                        if (raw === '-' || raw === '*' || raw === '+') {
                            items.push(Decoration.replace({ widget: new BulletWidget() })
                                .range(node.from, node.to));
                        }
                    }
                    return;
                }

                // 任务列表：GFM 的 [ ] / [x] 渲染为可点击复选框
                if (name === 'TaskMarker') {
                    if (!isActive(node.from, node.to)) {
                        const raw = doc.sliceString(node.from, node.to);
                        const checked = /[xX]/.test(raw);
                        items.push(Decoration.replace({
                            widget: new TaskCheckboxWidget(checked, node.from, node.to)
                        }).range(node.from, node.to));
                    }
                    return false;
                }

                return;
            }
        });
    }

    return Decoration.set(items, true);
}

function sameSearch(a, b) {
    if (searchPanelOpen(a) !== searchPanelOpen(b)) return true;
    if (!searchPanelOpen(b)) return false;
    try {
        const q1 = getSearchQuery(a);
        const q2 = getSearchQuery(b);
        return q1.search !== q2.search || q1.caseSensitive !== q2.caseSensitive
            || q1.regexp !== q2.regexp || q1.wholeWord !== q2.wholeWord;
    } catch (e) {
        return true;
    }
}

function inlinePreviewPlugin(getFilePath) {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.decorations = buildDecorations(view, getFilePath);
        }
        update(update) {
            // 语言支持异步装载完成后也需要重算，否则首帧会是空装饰
            if (update.docChanged || update.viewportChanged || update.selectionSet
                || update.startState.facet(language) !== update.state.facet(language)
                || sameSearch(update.startState, update.state)) {
                this.decorations = buildDecorations(update.view, getFilePath);
            }
        }
    }, {
        decorations: (v) => v.decorations
    });
}

// ---------------------------------------------------------------------------
// 块级预览（StateField）：表格、公式与独立成行的图片在源码下方追加渲染结果
// CM6 规定 block 装饰只能来自 StateField，不能来自 ViewPlugin
// ---------------------------------------------------------------------------
// 整行只有一个图片语法：![alt](url)（允许行首尾空白）
const STANDALONE_IMAGE_LINE = /^[ \t]*!\[([^\]]*)\]\((.*)\)[ \t]*$/;

function buildBlockPreviews(state, getFilePath) {
    const doc = state.doc;
    const filePath = typeof getFilePath === 'function' ? getFilePath() : null;
    const items = [];
    let fence = null;

    for (let n = 1; n <= doc.lines; n++) {
        const line = doc.line(n);
        const text = line.text;

        // 代码围栏：围栏内的内容不参与表格/公式/图片识别
        const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(text);
        if (fenceMatch) {
            const marker = fenceMatch[1][0];
            if (!fence) fence = marker;
            else if (fence === marker) fence = null;
            continue;
        }
        if (fence) continue;

        const trimmed = text.trim();

        // 独立成行的图片：源码行保留，图片渲染在下方
        const imageOnly = STANDALONE_IMAGE_LINE.exec(text);
        if (imageOnly) {
            const url = parseUrl(imageOnly[2]);
            if (url) {
                items.push(Decoration.widget({
                    widget: new ImageBlockWidget(resolveImageUrl(url, filePath), imageOnly[1]),
                    block: true, side: 1
                }).range(line.to));
            }
            continue;
        }

        // 块级公式 $$...$$
        if (trimmed.startsWith('$$')) {
            const single = trimmed.length > 2 ? trimmed.slice(2).lastIndexOf('$$') : -1;
            if (single !== -1) {
                const tex = trimmed.slice(2, 2 + single).trim();
                if (tex) {
                    items.push(Decoration.widget({
                        widget: new MathWidget(tex), block: true, side: 1
                    }).range(line.to));
                }
                continue;
            }
            let close = 0;
            for (let j = n + 1; j <= doc.lines; j += 1) {
                if (doc.line(j).text.includes('$$')) { close = j; break; }
            }
            if (!close) continue;
            const endLine = doc.line(close);
            const open = line.from + text.indexOf('$$');
            const end = endLine.from + endLine.text.indexOf('$$');
            const tex = doc.sliceString(open + 2, end).trim();
            if (tex) {
                items.push(Decoration.widget({
                    widget: new MathWidget(tex), block: true, side: 1
                }).range(endLine.to));
            }
            n = close;
            continue;
        }

        // GFM 表格：当前行是表头，下一行是对齐分隔行
        if (!text.includes('|') || n >= doc.lines) continue;
        const headerCells = splitRow(text);
        if (headerCells.length < 2) continue;
        const delimiter = splitRow(doc.line(n + 1).text);
        if (delimiter.length !== headerCells.length || !isDelimiterRow(delimiter)) continue;

        let last = n + 1;
        while (last + 1 <= doc.lines) {
            const next = doc.line(last + 1);
            if (!next.text.trim() || !next.text.includes('|')) break;
            last += 1;
        }
        const source = doc.sliceString(line.from, doc.line(last).to);
        items.push(Decoration.widget({
            widget: new TableWidget(source), block: true, side: 1
        }).range(doc.line(last).to));
        n = last;
    }

    return Decoration.set(items, true);
}

function blockPreviewField(getFilePath) {
    return StateField.define({
        create: (state) => ({
            decorations: buildBlockPreviews(state, getFilePath),
            path: typeof getFilePath === 'function' ? getFilePath() : null
        }),
        update(value, tr) {
            // 另存为会改变文件路径，相对图片地址需要重新解析
            const path = typeof getFilePath === 'function' ? getFilePath() : null;
            if (tr.docChanged || path !== value.path
                || tr.startState.facet(language) !== tr.state.facet(language)) {
                return { decorations: buildBlockPreviews(tr.state, getFilePath), path };
            }
            return value;
        },
        provide: (f) => EditorView.decorations.from(f, (v) => v.decorations)
    });
}

// ---------------------------------------------------------------------------
// 交互：任务复选框改写文档、Ctrl+Click 打开链接
// ---------------------------------------------------------------------------
function interactiveHandlers() {
    return EditorView.domEventHandlers({
        mousedown(event, view) {
            if (event.button !== 0) return false;

            const box = event.target.closest && event.target.closest('.md-task-checkbox');
            if (box) {
                const from = Number(box.getAttribute('data-from'));
                const to = Number(box.getAttribute('data-to'));
                if (Number.isFinite(from) && Number.isFinite(to)) {
                    const raw = view.state.doc.sliceString(from, to);
                    view.dispatch({
                        changes: { from, to, insert: /[xX]/.test(raw) ? '[ ]' : '[x]' }
                    });
                    event.preventDefault();
                    return true;
                }
            }

            if (event.ctrlKey || event.metaKey) {
                const link = event.target.closest && event.target.closest('.md-link');
                const href = link && link.getAttribute('data-href');
                if (href) {
                    event.preventDefault();
                    if (window.editbox && window.editbox.openExternal) {
                        window.editbox.openExternal(href);
                    }
                    return true;
                }
            }

            return false;
        }
    });
}

/**
 * @param {object} options
 * @param {() => (string|null)} [options.getFilePath] 当前文件绝对路径，用于解析相对图片地址
 */
export function markdownLivePreview(options = {}) {
    const getFilePath = typeof options.getFilePath === 'function'
        ? options.getFilePath
        : () => null;
    return [
        inlinePreviewPlugin(getFilePath),
        blockPreviewField(getFilePath),
        interactiveHandlers()
    ];
}
