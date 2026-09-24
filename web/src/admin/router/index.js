import { createRouter, createWebHashHistory } from 'vue-router';

// 路由全部懒加载（动态 import）：每个页面单独成 chunk，首屏只下载当前页。
//   - GraphView → vis-network（约 615KB）：只有进图谱页才下载
//   - Workspace 是 /admin 的默认路由，路由级的懒加载拦不住 Vditor；
//     它是在 Workspace.vue 里对 NoteEditor 再做一次异步拆分（defineAsyncComponent），
//     所以打开后台只下载工作区外壳，第一次点开笔记才拉编辑器（约 291KB JS）
// 其余 4 个页面（设置/Token/P2P/个人）这两个库都不需要。
const routes = [
    { path: '/', redirect: '/admin' },
    { path: '/admin', component: () => import('@/admin/views/Workspace.vue') },
    { path: '/admin/settings', component: () => import('@/admin/views/SiteSettings.vue') },
    { path: '/admin/tokens', component: () => import('@/admin/views/TokenManage.vue') },
    { path: '/admin/p2p', component: () => import('@/admin/views/P2pManage.vue') },
    { path: '/admin/graph', component: () => import('@/admin/views/GraphView.vue') },
    { path: '/admin/profile', component: () => import('@/admin/views/UserProfile.vue') }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes
});
