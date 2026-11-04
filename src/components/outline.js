/**
 * Markdown 大纲（outline）
 *
 * 在编辑区右侧、缩略图左侧停靠标题导航面板：
 * - 仅在 Markdown 文档中启用（由 CodeEditor 的 Compartment 控制装载）；
 * - 折叠时显示窄入口条（图标按钮），点击展开面板；再点标题栏内的同一按钮收起；
 * - 扫描 ATX（# 开头）与 Setext（=== / --- 下划线）标题，按级别缩进排列；
 * - 点击标题跳转到对应行，光标移动时高亮所属标题；
 * - 面板自身 position: sticky，正文垂直滚动时保持固定，标题多了可在面板内滚动；
 * - 开启缩略图时自动排在缩略图左侧（sticky right 让出缩略图宽度）；
 * - 文档没有标题时入口仍保留，展开后显示空态提示，避免入口消失后无法开启。
 */
import { EditorView, ViewPlugin } from '@codemirror/view';

const OUTLINE_WIDTH = 236;
const MIN_OUTLINE_WIDTH = 176;
const RAIL_WIDTH = 30;
const MAX_HEADINGS = 500;
const MAX_SCAN_LINES = 20000;
const REFRESH_DELAY = 80;

const LIST_ICON = `
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none"></circle>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>
    <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none"></circle>
    <path d="M9 7h10M9 12h10M9 17h10"></path>
</svg>`;

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
    // 折叠态是一条窄入口条，用浅填充色与正文区分
    '& .cm-em-outline.is-collapsed': {
        backgroundColor: 'var(--el-fill-color-light, #f5f7fa)'
    },
    '& .cm-em-outline-header': {
        position: 'sticky',
        top: '0',
        zIndex: '1',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        height: '36px',
        boxSizing: 'border-box',
        padding: '0 10px',
        backgroundColor: 'var(--el-bg-color, #ffffff)',
        borderBottom: '1px solid rgba(127, 127, 127, 0.18)'
    },
    '& .cm-em-outline.is-collapsed .cm-em-outline-header': {
        justifyContent: 'center',
        padding: '0',
        backgroundColor: 'var(--el-fill-color-light, #f5f7fa)',
        borderBottom: 'none'
    },
    '& .cm-em-outline-title': {
        flex: '1',
        minWidth: '0',
        fontSize: '13px',
        fontWeight: '600',
        color: 'var(--el-text-color-secondary, inherit)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        userSelect: 'none'
    },
    '& .cm-em-outline.is-collapsed .cm-em-outline-title': {
        display: 'none'
    },
    '& .cm-em-outline-toggle': {
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        padding: '0',
        border: 'none',
        borderRadius: '4px',
        background: 'transparent',
        color: 'var(--el-text-color-secondary, inherit)',
        cursor: 'pointer'
    },
    '& .cm-em-outline-toggle:hover': {
        backgroundColor: 'rgba(127, 127, 127, 0.16)',
        color: 'var(--el-text-color-primary, inherit)'
    },
    '& .cm-em-outline-list': {
        padding: '6px 0 10px'
    },
    '& .cm-em-outline.is-collapsed .cm-em-outline-list': {
        display: 'none'
    },
    '& .cm-em-outline.is-collapsed .cm-em-outline-empty': {
        display: 'none'
    },
    '& .cm-em-outline-item': {
        padding: '5px 10px',
        fontSize: '14px',
        lineHeight: '1.5',
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
    },
    '& .cm-em-outline-empty': {
        padding: '10px 12px',
        fontSize: '13px',
        color: 'var(--el-text-color-placeholder, inherit)',
        userSelect: 'none'
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

            this.header = document.createElement('div');
            this.header.className = 'cm-em-outline-header';
            this.titleEl = document.createElement('span');
            this.titleEl.className = 'cm-em-outline-title';
            this.titleEl.textContent = this.options.title || 'Outline';
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.type = 'button';
            this.toggleBtn.className = 'cm-em-outline-toggle';
            this.toggleBtn.innerHTML = LIST_ICON;
            this.toggleBtn.addEventListener('click', this.onToggleClick);
            this.header.appendChild(this.titleEl);
            this.header.appendChild(this.toggleBtn);

            this.list = document.createElement('div');
            this.list.className = 'cm-em-outline-list';
            this.list.addEventListener('click', this.onClick);

            this.emptyEl = document.createElement('div');
            this.emptyEl.className = 'cm-em-outline-empty';
            this.emptyEl.textContent = this.options.emptyText || '';

            this.dom.appendChild(this.header);
            this.dom.appendChild(this.list);
            this.dom.appendChild(this.emptyEl);
            this.insert();
            this.applyExpanded();
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
            this.toggleBtn.removeEventListener('click', this.onToggleClick);
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

        // 展开/收起态同步到 DOM 与提示文案
        applyExpanded() {
            const expanded = !!this.options.expanded;
            this.dom.classList.toggle('is-collapsed', !expanded);
            this.toggleBtn.title = expanded
                ? (this.options.collapseLabel || 'Collapse outline')
                : (this.options.expandLabel || 'Expand outline');
            this.toggleBtn.setAttribute('aria-label', this.toggleBtn.title);
            this.toggleBtn.setAttribute('aria-expanded', String(expanded));
            this.updateWidth();
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
                item.style.paddingLeft = `${10 + (heading.level - 1) * 14}px`;
                if (heading.level <= 2) item.style.fontWeight = '600';
                list.appendChild(item);
            }
            this.emptyEl.style.display = this.headings.length ? 'none' : '';
            this.list.style.display = this.headings.length ? '' : 'none';
            this.updateWidth();
        }

        updateWidth() {
            const expanded = !!this.options.expanded;
            let width = RAIL_WIDTH;
            if (expanded) {
                const editorWidth = this.view.dom.clientWidth || 0;
                width = Math.max(
                    MIN_OUTLINE_WIDTH,
                    Math.min(OUTLINE_WIDTH, Math.floor(editorWidth * 0.28))
                );
            }
            if (width !== this.width) {
                this.width = width;
                this.dom.style.width = `${width}px`;
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
            const headerHeight = this.header.offsetHeight;
            const viewHeight = this.dom.clientHeight - headerHeight;
            const top = item.offsetTop - headerHeight;
            if (top < this.dom.scrollTop) {
                this.dom.scrollTop = top;
            } else if (top + item.offsetHeight > this.dom.scrollTop + viewHeight) {
                this.dom.scrollTop = top + item.offsetHeight - viewHeight;
            }
        }

        onToggleClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof this.options.onToggle !== 'function') return;
            this.options.onToggle(!this.options.expanded);
        };

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
 * @param {{
 *   title?: string,
 *   emptyText?: string,
 *   expandLabel?: string,
 *   collapseLabel?: string,
 *   expanded?: boolean,
 *   onToggle?: (next: boolean) => void
 * }} options 面板文案与展开状态；onToggle 由外部接管状态持久化
 */
export function outline(options = {}) {
    return [outlineTheme, outlinePlugin.of(options)];
}
