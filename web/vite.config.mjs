/**
 * MeNote 前端构建配置
 *
 * 设计要点：
 * 1. root = web/ —— Vite 的 fs.allow 默认等于 root，把根收到 web/ 下，
 *    仓库根的 data/p2p-key.bin、data/menote.db、android/*.jks 天然在边界外，
 *    不会被 dev server 通过 /@fs/ 读到。
 * 2. publicDir = false —— 后端的静态目录 public/ 由 jj.js 独占，
 *    绝不能让 Vite 把它当成 publicDir 整份复制进构建产物。
 * 3. 产物输出到 ../public/static/dist/，由 jj.js 的静态服务（static_dir: './public'）直接提供。
 *    该目录是 Vite 独占的，因此 emptyOutDir 可以安全开启。
 * 4. base 只在 build 时是 /static/dist/，dev 保持 / 以便本地访问 /admin.html。
 */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const backend = 'http://localhost:3107';

export default defineConfig(({ command }) => ({
    root,
    base: command === 'build' ? '/static/dist/' : '/',
    publicDir: false,
    plugins: [
        vue({
            template: {
                // 关掉 <img src> 的资源重写。
                // 默认行为会把模板里的静态 src 当成构建期资源去解析，于是
                // `<img src="/logo.png">` 被当成模块 import，报 UNRESOLVED_IMPORT。
                // 但本项目 publicDir=false（public/ 归 jj.js 独占），/logo.png 是
                // 后端的路由（config/routes.js 里有显式条目），根本不该走打包。
                // 其余标签（如 <video poster>）没有用到，保持默认即可。
                transformAssetUrls: {img: []}
            }
        })
    ],

    define: {
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
    },

    resolve: {
        alias: {
            '@': resolve(root, 'src')
        }
    },

    build: {
        outDir: resolve(root, '../public/static/dist'),
        emptyOutDir: true,
        assetsDir: 'assets',
        rollupOptions: {
            input: {
                // 两个独立入口，各自一套 chunk 图：
                //   admin —— 后台 SPA（hash 路由），产出 public/static/dist/admin.html
                //   home  —— 前台 SPA（history 路由），产出 public/static/dist/home.html
                // 共用 vue / vue-router（被 codeSplitting 归到 vendor-vue），
                // 但 Element Plus 只有后台用、Vditor 只有前台笔记页用，互不拖累
                //
                // 前台入口叫 home 而不是 public：源码目录 src/home 与静态目录 public/ 同名时
                // 极易看混（尤其排查路径问题时）
                admin: resolve(root, 'admin.html'),
                home: resolve(root, 'home.html')
            },
            output: {
                entryFileNames: 'assets/[name].[hash].js',
                chunkFileNames: 'assets/[name].[hash].js',
                assetFileNames: 'assets/[name].[hash].[ext]',
                // 把第三方库按来源切成独立的稳定 chunk。
                // 目的不是减小总体积（总体积由按需引入决定），而是让缓存更耐用：
                // vue / element-plus 这些库跟着业务代码一起变 hash 的话，每次发版
                // 用户都要重下几百 KB；单独成 chunk 后只有真正改动的那个才失效。
                // 注意：Rolldown 里 codeSplitting 与 advancedChunks 同时指定时后者被忽略。
                codeSplitting: {
                    groups: [
                        { name: 'vendor-vue', test: /node_modules[\\/](vue|@vue|vue-router)[\\/]/ },
                        { name: 'vendor-element-plus', test: /node_modules[\\/](element-plus|@element-plus)[\\/]/ },
                        { name: 'vendor-vditor', test: /node_modules[\\/]vditor[\\/]/ },
                        { name: 'vendor-vis', test: /node_modules[\\/](vis-network|vis-data|vis-util|@egjs)[\\/]/ },
                        { name: 'vendor', test: /node_modules[\\/]/ }
                    ]
                }
            }
        },
        // 默认 500kB 的告警阈值对"按需 + 懒加载"后的单 chunk 偏严，
        // 调到 700kB：当前最大的 GraphView（vis-network）约 617kB，属预期内
        chunkSizeWarningLimit: 700
    },

    server: {
        port: 5173,
        // 开发期联调：先在 3107 登录一次（cookie 按 host 共享、不区分端口），
        // 之后 5173 下的请求会自动带上会话，无需任何 CORS 配置。
        proxy: {
            '/api': backend,
            '/upload': backend,
            '/static/vendor': backend,
            '/admin/login': backend,
            '/logo.png': backend,
            '/favicon.ico': backend
        }
    }
}));
