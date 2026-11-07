import { createApp } from 'vue';
import { createPinia } from 'pinia';
// Element Plus 组件由 unplugin-vue-components 按需引入；
// 这里只补充命令式 API（ElMessage / ElMessageBox）的样式与暗色变量
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import App from './App.vue';
import router from './router';
import i18n from './i18n';
import { useEditorStore } from '@/stores/editor';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.use(router);
app.mount('#app');

// ====== 缩放（Ctrl+滚轮；Ctrl+=/-/0 由原生菜单 accelerator 接管） ======
// 缩放比例由 editor store 统一持有，状态栏据此实时显示
const editorStore = useEditorStore();
editorStore.initZoom();
editorStore.bindZoomChanged();

function adjustZoom(delta) {
    editorStore.setZoom(editorStore.zoomFactor + delta);
}

document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        adjustZoom(e.deltaY > 0 ? -0.1 : 0.1);
    }
}, { passive: false });

// Ctrl+PageUp/PageDown 切换上一个/下一个标签页；
// Ctrl+Shift+PageUp/PageDown 将当前标签页前移/后移一位
// （其余快捷键由原生菜单 accelerator 接管）
document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    if (e.code !== 'PageUp' && e.code !== 'PageDown') return;
    e.preventDefault();
    const dir = e.code === 'PageDown' ? 1 : -1;
    if (e.shiftKey) {
        if (editorStore.activeId !== null) editorStore.moveTab(editorStore.activeId, dir);
    } else {
        switchTab(editorStore, dir);
    }
});

function switchTab(store, dir) {
    if (store.tabs.length === 0) return;
    const idx = store.tabs.findIndex(t => t.id === store.activeId);
    const next = (idx + dir + store.tabs.length) % store.tabs.length;
    store.activeId = store.tabs[next].id;
    store.persistSession();
}
