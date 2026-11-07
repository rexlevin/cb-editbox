import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import pkg from './package.json'

// KaTeX 的样式引用了 woff2 / woff / ttf 三套字体，Electron(Chromium) 只需 woff2。
// 打包后删除 woff、ttf 字体文件及 CSS 中的对应 src，减少约 800KB 产物。
function katexWoff2Only() {
    return {
        name: 'katex-woff2-only',
        enforce: 'post',
        generateBundle(_options, bundle) {
            const dropSrc = /,\s*url\([^)]+\)\s*format\((["']?)(?:woff|truetype)\1\)/g
            for (const [fileName, output] of Object.entries(bundle)) {
                if (/KaTeX_[^/]*\.(woff|ttf)$/.test(fileName)) {
                    delete bundle[fileName]
                } else if (fileName.endsWith('.css') && output.source.includes('KaTeX_')) {
                    output.source = output.source.replace(dropSrc, '')
                }
            }
        }
    }
}

// https://vite.dev/config/
export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    plugins: [
        vue(),
        // Element Plus 按需引入：模板里的 <el-*> 自动注册并按需带样式
        Components({
            resolvers: [ElementPlusResolver()],
        }),
        katexWoff2Only(),
    ],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_DESCRIPTION__: JSON.stringify(pkg.description)
    },
    build: {
        outDir: 'build',
        chunkSizeWarningLimit: 1500
    }
})
