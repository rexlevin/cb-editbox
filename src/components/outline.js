/**
 * Markdown 大纲（outline）
 *
 * 在编辑区右侧、缩略图左侧插入固定宽度的标题导航面板：
 * - 仅在 Markdown 文档中启用（由 CodeEditor 的 Compartment 控制装载）；
 * - 扫描 ATX（# 开头）与 Setext（=== / --- 下划线）标题，按级别缩进排列；
 * - 点击标题跳转到对应行，光标移动时高亮所属标题；
 * - 面板自身 position: sticky，正文垂直滚动时保持固定，标题多了可在面板内滚动；
 * - 开启缩略图时自动排在缩略图左侧（sticky right 让出缩略图宽度）。
 */
import { EditorView, ViewPlugin } from '@codemirror/view';

const OUTLINE_WIDTH = 196;
const MIN_OUTLINE_WIDTH = 140;
const MAX_HEADINGS = 500;
const MAX_SCAN_LINES = 20000;
const REFRESH_DELAY = 80;

// 行内标记去掉后更接近渲染后的标题文本
function cleanInline(text) {
    return text
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_~]/g, '')
        .trim();
}

// 扫描标题：跳过围栏代码块，支持 ATX 与 Setext 两种写法
function scanHeadings(doc) {
    const headings = [];
    let fence = null;
    const lines = Math.min(doc.lines, MAX_SCAN_LINES);
    for (let n = 1; n <= lines && headings.length < MAX_HEADINGS; n += 1) {
        const text = doc.line(n).text;

        const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(text);
        if (fence) {
            if (fenceMark && fenceMark[1][0] === fence.char && fenceMark[1].length >= fence.len) {
                fence = null;
            }
            continue;
        }
        if (fenceMark) {
            fence = { char: fenceMark[1][0], len: fenceMark[1].length };
            continue;
        }

        const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?[ \t]*$/.exec(text);
        if (atx) {
            const level = atx[1].length;
            let title = atx[2] || '';
            // 去掉行尾闭合的 # 序列（CommonMark 要求前面有空白）
            title = cleanInline(title.replace(/[ \t]+#+[ \t]*$/, ''));
            headings.push({
                level,
                title: title || '#'.repeat(level),
                from: doc.line(n).from
            });
            continue;
        }

        // Setext 标题：本行普通文本，下一行是 === 或 ---
        if (n < lines) {
            const next = doc.line(n + 1).text;
            const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(next);
            if (underline && text.trim() && !/^ {4,}|\t/.test(text) && !/^\s*>/.test(text)) {
                const level = underline[1][0] === '=' ? 1 : 2;
                headings.push({
                    level,
                    title: cleanInline(text.trim()),
                    from: doc.line(n).from
                });
                n += 1;
            }
        }
    }
    return headings;
}

const outlineTheme = EditorView.theme({
    '& .cm-em-outline': {
        position: 'sticky',
        top: '0',
        height: '100%',
        flexShrink: '0',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: '2',
        // 不透明背景：横向滚动时正文长行不会透到面板下方
        backgroundColor: 'var(--el-bg-color, #ffffff)',
        borderLeft: '1px solid rgba(127, 127, 127, 0.25)',
        // 缩略图开启时让出缩略图宽度，保证大纲排在缩略图左侧
        right: 'var(--cm-minimap-width, 0px)'
    },
    '& .cm-em-outline-title': {
        position: 'sticky',
        top: '0',
        zIndex: '1',
        padding: '6px 8px 5px',
        fontSize: '12px',
        fontWeight: '600',
        color: 'var(--el-text-color-secondary, inherit)',
        backgroundColor: 'var(--el-bg-color, #ffffff)',
        borderBottom: '1px solid rgba(127, 127, 127, 0.18)',
        userSelect: 'none'
    },
    '& .cm-em-outline-item': {
        padding: '2px 8px',
        fontSize: '12px',
        lineHeight: '1.55',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: 'pointer',
        userSelect: 'none'
    },
    '& .cm-em-outline-item:hover': {
        backgroundColor: 'rgba(127, 127, 127, 0.12)'
    },
    '& .cm-em-outline-item.active': {
        color: 'var(--el-color-primary, #3b82f6)',
        backgroundColor: 'rgba(127, 127, 127, 0.16)'
    }
});

const outlinePlugin = ViewPlugin.fromClass(
    class {
        constructor(view, options) {
            this.view = view;
            this.options = options || {};
            this.width = 0;
            this.headings = [];
            this.activeIndex = -1;
            this.timer = 0;
            this.dom = document.createElement('div');
            this.dom.className = 'cm-em-outline';
            this.dom.addEventListener('mousedown', (event) => event.stopPropagation());
            this.titleEl = document.createElement('div');
            this.titleEl.className = 'cm-em-outline-title';
            this.titleEl.textContent = this.options.title || 'Outline';
            this.list = document.createElement('div');
            this.list.className = 'cm-em-outline-list';
            this.list.addEventListener('click', this.onClick);
            this.dom.appendChild(this.titleEl);
            this.dom.appendChild(this.list);
            this.insert();
            this.refresh();
        }

        // 插到正文之后；若缩略图已存在则插在它左侧
        insert() {
            const scroller = this.view.scrollDOM;
            const minimap = scroller.querySelector('.cm-em-minimap');
            scroller.insertBefore(this.dom, minimap || this.view.contentDOM.nextSibling);
        }

        destroy() {
            if (this.timer) clearTimeout(this.timer);
            this.timer = 0;
            this.list.removeEventListener('click', this.onClick);
            this.dom.remove();
            this.setWidthVar(0);
            this.dom = null;
        }

        update(update) {
            if (update.docChanged) this.scheduleRefresh();
            if (update.docChanged || update.selectionSet) this.syncActive();
            if (update.geometryChanged) this.updateWidth();
        }

        scheduleRefresh() {
            if (this.timer) return;
            this.timer = setTimeout(() => {
                this.timer = 0;
                this.refresh();
            }, REFRESH_DELAY);
        }

        refresh() {
            this.headings = scanHeadings(this.view.state.doc);
            this.renderList();
            // 列表重建后旧的活动项样式已丢失，重置后重新计算
            this.activeIndex = -1;
            this.syncActive();
        }

        renderList() {
            const list = this.list;
            list.textContent = '';
            for (let i = 0; i < this.headings.length; i += 1) {
                const heading = this.headings[i];
                const item = document.createElement('div');
                item.className = 'cm-em-outline-item';
                item.dataset.index = String(i);
                item.textContent = heading.title;
                item.title = heading.title;
                item.style.paddingLeft = `${8 + (heading.level - 1) * 12}px`;
                if (heading.level <= 2) item.style.fontWeight = '600';
                list.appendChild(item);
            }
            this.updateWidth();
        }

        updateWidth() {
            const shown = this.headings.length > 0;
            let width = 0;
            if (shown) {
                const editorWidth = this.view.dom.clientWidth || 0;
                width = Math.max(
                    MIN_OUTLINE_WIDTH,
                    Math.min(OUTLINE_WIDTH, Math.floor(editorWidth * 0.24))
                );
            }
            this.dom.style.display = shown ? '' : 'none';
            if (width !== this.width) {
                this.width = width;
                this.dom.style.width = width ? `${width}px` : '';
                this.view.requestMeasure();
            }
            this.setWidthVar(width);
        }

        // CSS 变量供查找面板等浮层计算避让距离
        setWidthVar(width) {
            this.view.dom.style.setProperty('--cm-outline-width', `${width || 0}px`);
        }

        minimapWidth() {
            const el = this.view.scrollDOM.querySelector('.cm-em-minimap');
            return el ? parseFloat(el.style.width) || 0 : 0;
        }

        syncActive() {
            const head = this.view.state.selection.main.head;
            let index = -1;
            for (let i = 0; i < this.headings.length; i += 1) {
                if (this.headings[i].from <= head) index = i;
                else break;
            }
            if (index === this.activeIndex) return;
            this.activeIndex = index;
            const items = this.list.children;
            for (let i = 0; i < items.length; i += 1) {
                items[i].classList.toggle('active', i === index);
            }
            this.revealActive();
        }

        // 活动标题超出面板可视范围时，面板内滚动到它
        revealActive() {
            if (this.activeIndex < 0) return;
            const item = this.list.children[this.activeIndex];
            if (!item) return;
            const titleHeight = this.titleEl.offsetHeight;
            const viewHeight = this.dom.clientHeight - titleHeight;
            const top = item.offsetTop - titleHeight;
            if (top < this.dom.scrollTop) {
                this.dom.scrollTop = top;
            } else if (top + item.offsetHeight > this.dom.scrollTop + viewHeight) {
                this.dom.scrollTop = top + item.offsetHeight - viewHeight;
            }
        }

        onClick = (event) => {
            const item = event.target.closest('.cm-em-outline-item');
            if (!item) return;
            const heading = this.headings[Number(item.dataset.index)];
            if (!heading) return;
            this.view.focus();
            this.view.dispatch({
                selection: { anchor: heading.from },
                effects: EditorView.scrollIntoView(heading.from, { y: 'start', yMargin: 8 })
            });
        };
    },
    {
        provide: (plugin) => [
            EditorView.scrollMargins.of((view) => {
                const instance = view.plugin(plugin);
                if (!instance || !instance.width) return null;
                // 大纲在缩略图左侧，两者占用宽度需要一起计入
                return { right: instance.width + instance.minimapWidth() };
            })
        ]
    }
);

/**
 * @param {{ title?: string }} options 面板标题文案
 */
export function outline(options = {}) {
    return [outlineTheme, outlinePlugin.of(options)];
}
