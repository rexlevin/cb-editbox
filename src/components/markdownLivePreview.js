/**
 * Markdown 实时渲染（B-lite）
 *
 * 设计原则：文档始终是 Markdown 源码，本扩展只叠加展示装饰，不修改任何字符。
 * - 光标/选区所在行保持源码原样（Typora 式），其余行隐藏语法标记并渲染样式；
 * - 只遍历可视区域，避免大文档全量扫描；
 * - 不使用任何第三方渲染器，无内容规范化、无撤销栈割裂。
 *
 * 支持范围：标题、粗体、斜体、删除线、行内代码、链接、引用、代码块底色、
 * 图片、分隔线、无序列表符号。表格与公式保持源码（明确不做）。
 */
import { syntaxTree, language } from '@codemirror/language';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';

const HIDE = Decoration.replace({});

const MARK_STRONG = Decoration.mark({ class: 'md-strong' });
const MARK_EM = Decoration.mark({ class: 'md-em' });
const MARK_STRIKE = Decoration.mark({ class: 'md-strike' });
const MARK_CODE = Decoration.mark({ class: 'md-code' });
const MARK_LINK = Decoration.mark({ class: 'md-link' });

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

function buildDecorations(view) {
    const { state } = view;
    const doc = state.doc;

    // 选区覆盖的所有行：这些行保持源码，不隐藏语法
    const activeLines = new Set();
    for (const range of state.selection.ranges) {
        const first = doc.lineAt(range.from).number;
        const last = doc.lineAt(range.to).number;
        for (let n = first; n <= last; n++) activeLines.add(n);
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

                // 代码块：整块加底色并隐藏围栏标记
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
                    const active = isActive(node.from, node.to);
                    if (name === 'Image') {
                        if (!active) {
                            const alt = raw.slice(2, split);
                            const url = parseUrl(raw.slice(split + 2, raw.length - 1));
                            if (url) {
                                items.push(Decoration.replace({ widget: new ImageWidget(url, alt) })
                                    .range(node.from, node.to));
                            }
                        }
                        return false;
                    }
                    const innerFrom = node.from + (raw.startsWith('![') ? 2 : 1);
                    const innerTo = node.from + split;
                    if (innerFrom < innerTo) items.push(MARK_LINK.range(innerFrom, innerTo));
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

                // 无序列表符号替换为圆点，有序列表保持源码（避免编号错乱）
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

                return;
            }
        });
    }

    return Decoration.set(items, true);
}

export function markdownLivePreview() {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.decorations = buildDecorations(view);
        }
        update(update) {
            // 语言支持异步装载完成后也需要重算，否则首帧会是空装饰
            if (update.docChanged || update.viewportChanged || update.selectionSet
                || update.startState.facet(language) !== update.state.facet(language)) {
                this.decorations = buildDecorations(update.view);
            }
        }
    }, {
        decorations: (v) => v.decorations
    });
}
