/**
 * 可感知自动换行的缩略图（minimap）
 *
 * 替代 @replit/codemirror-minimap：原实现按“文档逻辑行”逐行绘制，
 * 开启自动换行后，长行在编辑区里会占多行高度、在缩略图里却只占一行，
 * 导致缩略图内容与滚动位置完全对不上（滚动条跑到缩略图内容之外）。
 *
 * 这里改为直接使用 EditorView 的真实行块信息（lineBlockAt / lineBlockAtHeight）：
 * - 每个行块的纵向坐标与高度都来自编辑器实际排版，换行折行后的高度自然计入；
 * - 以 1/8 比例把文档窗口画进固定高度的画布，窗口随滚动移动；
 * - 覆盖层按文档比例标出当前可视区域，点击/拖动可按比例跳转滚动；
 * - 语法着色沿用 highlightTree + highlightingFor，明暗主题切换后重算样式。
 */
import { EditorView, ViewPlugin } from '@codemirror/view';
import { syntaxTree, language, highlightingFor } from '@codemirror/language';
import { highlightTree } from '@lezer/highlight';

const MINIMAP_WIDTH = 69; // 60px × 1.15
const SCALE = 1 / 8;      // 缩略图为编辑区的 1/8 比例
const DPR = 2;
const MAX_LINES = 5000;
// 视窗滑块的最小高度，保证短文档/小窗口下仍有足够的抓取面积
const MIN_OVERLAY_HEIGHT = 20;
// 单帧最多绘制的行数，避免异常高度信息导致死循环
const MAX_BLOCKS = 4000;

function computeWidth(view) {
    const editorWidth = view.dom.clientWidth || 0;
    return Math.max(24, Math.min(MINIMAP_WIDTH, Math.floor(editorWidth / 6)));
}

// 取编辑器实际背景色（主题可能只在上层容器上设置背景，逐级向上查找）
function resolveBackground(el) {
    let node = el;
    while (node && node.nodeType === 1) {
        const color = getComputedStyle(node).backgroundColor;
        if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
        node = node.parentElement;
    }
    return '';
}

// 主题类名签名（忽略焦点态），用于判断明暗主题是否切换
function themeSignature(el) {
    return el.classList.value.replace(/\bcm-focused\b/g, '').replace(/\s+/g, ' ').trim();
}

const minimapTheme = EditorView.theme({
    '& .cm-em-minimap': {
        position: 'sticky',
        top: '0',
        right: '0',
        height: '100%',
        flexShrink: '0',
        overflow: 'hidden',
        zIndex: '2',
        // 不透明背景，避免横向滚动时正文长行透到缩略图上（与行号槽同理）
        backgroundColor: 'var(--el-bg-color, #ffffff)'
    },
    '& .cm-em-minimap-inner': {
        position: 'absolute',
        top: '0',
        right: '0',
        width: '100%',
        height: '100%',
        overflow: 'hidden'
    },
    '& .cm-em-minimap canvas': {
        display: 'block'
    },
    '& .cm-em-minimap-overlay': {
        position: 'absolute',
        left: '0',
        right: '0',
        background: 'rgb(121, 121, 121)',
        opacity: '0.22',
        pointerEvents: 'none'
    }
});

const minimapPlugin = ViewPlugin.fromClass(
    class {
        constructor(view) {
            this.view = view;
            this.active = false;
            this.raf = 0;
            this.dragging = false;
            this.width = 0;
            this.windowTop = 0;
            this.styleCache = new Map();
            this.themeClasses = themeSignature(view.dom);
            this.onMouseDown = (e) => this.handleMouseDown(e);
            this.onMouseMove = (e) => this.handleMouseMove(e);
            this.onMouseUp = () => this.handleMouseUp();
            this.observer = new ResizeObserver(() => this.schedule());
            this.observer.observe(view.scrollDOM);
            // 明暗主题切换时 CodeMirror 会更新外层类名（伴随高亮样式类变化），
            // 插件 update() 阶段类名尚未更新，故用 MutationObserver 在 DOM 更新后重绘
            this.classObserver = new MutationObserver(() => {
                const signature = themeSignature(view.dom);
                if (signature === this.themeClasses) return;
                this.themeClasses = signature;
                this.styleCache.clear();
                this.schedule();
            });
            this.classObserver.observe(view.dom, { attributes: true, attributeFilter: ['class'] });
            this.check();
        }

        check() {
            const show = this.view.state.doc.lines <= MAX_LINES;
            if (show && !this.active) this.create();
            else if (!show && this.active) this.remove();
        }

        create() {
            const view = this.view;
            this.width = computeWidth(view);
            this.dom = document.createElement('div');
            this.dom.className = 'cm-em-minimap';
            this.dom.style.width = this.width + 'px';
            this.inner = document.createElement('div');
            this.inner.className = 'cm-em-minimap-inner';
            this.canvas = document.createElement('canvas');
            this.overlay = document.createElement('div');
            this.overlay.className = 'cm-em-minimap-overlay';
            this.inner.appendChild(this.canvas);
            this.inner.appendChild(this.overlay);
            this.dom.appendChild(this.inner);
            // 大纲开启时排在它右侧，保证顺序为：正文 → 大纲 → 缩略图
            const outline = view.scrollDOM.querySelector('.cm-em-outline');
            view.scrollDOM.insertBefore(this.dom, outline ? outline.nextSibling : view.contentDOM.nextSibling);
            view.dom.style.setProperty('--cm-minimap-width', this.width + 'px');
            this.dom.addEventListener('mousedown', this.onMouseDown);
            window.addEventListener('mousemove', this.onMouseMove);
            window.addEventListener('mouseup', this.onMouseUp);
            this.active = true;
            this.render();
            // 缩略图占位会改变右侧滚动边距，重新测量一次
            view.requestMeasure();
        }

        remove() {
            if (this.dom) {
                this.dom.removeEventListener('mousedown', this.onMouseDown);
                this.dom.remove();
            }
            window.removeEventListener('mousemove', this.onMouseMove);
            window.removeEventListener('mouseup', this.onMouseUp);
            if (this.view && !this.view.destroyed) {
                this.view.dom.style.setProperty('--cm-minimap-width', '0px');
            }
            this.dom = null;
            this.inner = null;
            this.canvas = null;
            this.overlay = null;
            this.active = false;
            this.dragging = false;
        }

        destroy() {
            if (this.raf) cancelAnimationFrame(this.raf);
            this.raf = 0;
            this.observer.disconnect();
            this.classObserver.disconnect();
            this.remove();
        }

        update(update) {
            if (update.docChanged) {
                this.check();
                this.schedule();
                return;
            }
            if (update.geometryChanged
                || update.startState.facet(language) !== update.state.facet(language)) {
                this.schedule();
            }
        }

        schedule() {
            if (this.raf || !this.active) return;
            this.raf = requestAnimationFrame(() => {
                this.raf = 0;
                this.render();
            });
        }

        getStyle(classes) {
            const key = classes + '|' + this.fontFamily + '|' + this.fontSize;
            const cached = this.styleCache.get(key);
            if (cached) return cached;
            // 借助编辑器自己的主题样式计算 token 的字体与颜色
            const span = document.createElement('span');
            if (classes) span.className = classes;
            const line = document.createElement('div');
            line.className = 'cm-line';
            line.style.display = 'none';
            line.appendChild(span);
            this.view.contentDOM.appendChild(line);
            const style = getComputedStyle(span);
            const info = {
                color: style.color,
                font: `${style.fontStyle} ${style.fontWeight} ${this.fontSize}px ${this.fontFamily}`
            };
            this.view.contentDOM.removeChild(line);
            this.styleCache.set(key, info);
            return info;
        }

        render() {
            if (!this.active || !this.canvas || !this.inner) return;
            const view = this.view;
            const scroller = view.scrollDOM;
            const height = scroller.clientHeight;
            if (!height) return;

            const width = computeWidth(view);
            if (width !== this.width) {
                this.width = width;
                this.dom.style.width = width + 'px';
                view.dom.style.setProperty('--cm-minimap-width', width + 'px');
                view.requestMeasure();
            }

            // 与左侧行号槽一样用不透明底色，横向滚动时长行从缩略图下方滑过而不会透出文字。
            // 必须无条件赋值：浅色主题下各层背景透明（解析结果为空）时要清掉内联色，
            // 交回 CSS 的 var(--el-bg-color) 跟随主题，否则深色模式写入的内联色会残留
            this.dom.style.backgroundColor = resolveBackground(view.dom);

            const contentStyle = getComputedStyle(view.contentDOM);
            this.fontFamily = contentStyle.fontFamily || 'monospace';
            const lineHeight = parseFloat(contentStyle.lineHeight)
                || parseFloat(contentStyle.fontSize) * 1.6
                || 20;
            this.fontSize = Math.max(2, lineHeight * SCALE);
            const defaultColor = contentStyle.color;

            const canvasWidth = Math.round(this.width * DPR);
            const canvasHeight = Math.round(height * DPR);
            if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
                this.canvas.width = canvasWidth;
                this.canvas.height = canvasHeight;
            }
            this.canvas.style.width = this.width + 'px';
            this.canvas.style.height = height + 'px';

            const ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.clearRect(0, 0, this.width, height);

            const doc = view.state.doc;
            const contentHeight = Math.max(scroller.scrollHeight, height);
            const scrollTop = scroller.scrollTop;
            // 画布视窗对应的文档纵向范围：编辑区高度 × 8
            const windowHeight = height / SCALE;
            const maxScroll = Math.max(1, contentHeight - height);
            const scrollPercent = Math.max(0, Math.min(1, scrollTop / maxScroll));
            const maxWindowTop = Math.max(0, contentHeight - windowHeight);
            // 视窗位置与滚动进度保持线性关系，覆盖层才能随滚动/拖动同步移动
            const windowTop = scrollPercent * maxWindowTop;
            const windowBottom = windowTop + windowHeight;
            this.windowTop = windowTop;

            // 从视窗顶部开始，按真实行块逐个收集行位置（含换行后的高度）
            const blocks = [];
            let block;
            try {
                block = view.lineBlockAtHeight(windowTop);
            } catch (e) {
                block = view.lineBlockAt(0);
            }
            let guard = 0;
            while (block && guard < MAX_BLOCKS) {
                guard += 1;
                const firstLine = doc.lineAt(Math.min(block.from, doc.length)).number;
                const lastLine = doc.lineAt(Math.min(block.to, doc.length)).number;
                const count = Math.max(1, lastLine - firstLine + 1);
                const rowHeight = (block.height / count) * SCALE;
                for (let n = firstLine; n <= lastLine; n += 1) {
                    blocks.push({
                        line: doc.line(n),
                        top: (block.top - windowTop) * SCALE
                            + (n - firstLine) * rowHeight,
                        height: Math.max(1, rowHeight)
                    });
                }
                if (block.to >= doc.length || block.bottom >= windowBottom) break;
                const next = view.lineBlockAt(block.to + 1);
                if (!next || next.top <= block.top) break;
                block = next;
            }

            // 可见范围内的语法着色
            const highlights = [];
            if (blocks.length) {
                const from = blocks[0].line.from;
                const to = blocks[blocks.length - 1].line.to;
                const tree = syntaxTree(view.state);
                if (view.state.facet(language) && tree.length) {
                    highlightTree(tree, {
                        style: (tags) => highlightingFor(view.state, tags)
                    }, (hf, ht, classes) => {
                        highlights.push({ from: hf, to: ht, classes });
                    }, from, to);
                }
            }

            ctx.textBaseline = 'middle';
            let hi = 0;
            for (const item of blocks) {
                if (item.top > height) break;
                const line = item.line;
                const y = item.top + Math.min(item.height, this.fontSize) / 2;
                let x = 0;
                let pos = line.from;
                while (hi < highlights.length && highlights[hi].to <= line.from) hi += 1;
                let index = hi;
                while (index < highlights.length
                    && highlights[index].from < line.to
                    && x <= this.width) {
                    const token = highlights[index];
                    const tokenFrom = Math.max(token.from, line.from);
                    const tokenTo = Math.min(token.to, line.to);
                    if (tokenFrom > pos) {
                        x = this.drawText(ctx, doc.sliceString(pos, tokenFrom), '', x, y, defaultColor);
                    }
                    if (tokenTo > tokenFrom) {
                        x = this.drawText(ctx, doc.sliceString(tokenFrom, tokenTo), token.classes, x, y, defaultColor);
                    }
                    pos = Math.max(pos, tokenTo);
                    if (token.to >= line.to) break;
                    hi = index + 1;
                    index += 1;
                }
                if (pos < line.to) {
                    this.drawText(ctx, doc.sliceString(pos, line.to), '', x, y, defaultColor);
                }
            }

            // 覆盖层：可视区域在缩略图实际绘制区域中的占比。
            // 缩略图按 1/8 比例绘制「当前窗口」（约 8 屏），因此长文档下可视区高度
            // 应为 height × SCALE；若按整篇文档比例计算，1000+ 行文档的滑块会被压得很小。
            // 文档不足一屏时 drawnHeight 即整篇文档的绘制高度，两种算法结果一致。
            const innerHeight = this.inner.clientHeight || height;
            const drawnHeight = Math.min(innerHeight, contentHeight * SCALE);
            const visibleHeight = Math.min(height, contentHeight);
            const overlayHeight = Math.min(
                drawnHeight,
                Math.max(MIN_OVERLAY_HEIGHT, visibleHeight * SCALE)
            );
            this.overlayHeight = overlayHeight;
            this.drawnHeight = drawnHeight;
            const overlayTop = scrollPercent * Math.max(0, drawnHeight - overlayHeight);
            this.overlay.style.height = overlayHeight + 'px';
            this.overlay.style.top = overlayTop + 'px';
        }

        drawText(ctx, text, classes, x, y, defaultColor) {
            if (!text) return x;
            if (x > this.width) return x;
            const info = this.getStyle(classes);
            ctx.font = info.font;
            ctx.fillStyle = info.color || defaultColor;
            const value = text.replace(/\t/g, '    ');
            ctx.fillText(value, x, y);
            return x + ctx.measureText(value).width;
        }

        handleMouseDown(event) {
            if (!this.active || event.button !== 0) return;
            event.preventDefault();
            this.dragging = true;
            this.scrollToClientY(event.clientY);
        }

        handleMouseMove(event) {
            if (!this.dragging) return;
            event.preventDefault();
            this.scrollToClientY(event.clientY);
        }

        handleMouseUp() {
            this.dragging = false;
        }

        // 按比例定位：拖动时覆盖层中心始终跟随鼠标，缩略图内容同步滚动
        scrollToClientY(clientY) {
            if (!this.canvas) return;
            const scroller = this.view.scrollDOM;
            const rect = this.canvas.getBoundingClientRect();
            const offsetY = clientY - rect.top;
            const drawnHeight = this.drawnHeight || rect.height;
            const overlayHeight = this.overlayHeight || 0;
            const range = drawnHeight - overlayHeight;
            const fraction = range > 0
                ? Math.max(0, Math.min(1, (offsetY - overlayHeight / 2) / range))
                : 0;
            scroller.scrollTop = fraction * Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        }
    },
    {
        eventHandlers: {
            scroll() { this.schedule(); }
        }
    }
);

/**
 * 主题切换后强制缩略图重算样式缓存并重绘。
 * 缩略图容器背景是 render() 写入的内联色，必须重绘才能跟随主题。
 */
export function refreshMinimap(view) {
    const instance = view.plugin(minimapPlugin);
    if (!instance) return;
    instance.styleCache.clear();
    instance.schedule();
}

const minimapMargins = EditorView.scrollMargins.of((view) => {
    const plugin = view.plugin(minimapPlugin);
    return plugin && plugin.active ? { right: plugin.width } : null;
});

export function minimap() {
    return [minimapTheme, minimapPlugin, minimapMargins];
}
