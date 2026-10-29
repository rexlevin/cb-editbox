import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import pkg from './package.json'

// https://vite.dev/config/
// @replit/codemirror-minimap 把缩略图最大宽度写死为 120px（Scale.MaxWidth，无配置项）。
// 这里在模块加载时改成 60px：画布按其计算宽度重新绘制，字符按 1/4 缩放，不会像 CSS 拉伸那样横向压扁。
function minimapWidth() {
    const from = 'MaxWidth: 120'
    return {
        name: 'minimap-width',
        enforce: 'pre',
        transform(code, id) {
            if (!id.includes('@replit/codemirror-minimap')) return null
            if (!code.includes(from)) {
                this.warn('minimap 宽度补丁未命中，缩略图将保持默认宽度')
                return null
            }
            return code.replace(from, 'MaxWidth: 60')
        }
    }
}

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    plugins: [minimapWidth(), vue()],
    // 该依赖不能走 esbuild 预打包，否则上面的 transform 在 dev 下不生效
    optimizeDeps: {
        exclude: ['@replit/codemirror-minimap']
    },
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_DESCRIPTION__: JSON.stringify(pkg.description)
    },
    build: {
        outDir: 'build',
        chunkSizeWarningLimit: 1500
    }
})
