import { createRouter, createWebHashHistory } from 'vue-router';

// 路由全部懒加载（动态 import）：每个页面单独成 chunk，首屏只下载当前页。
// 收益最大的是两个重依赖——它们被路由隔离后不再进首屏包：
//   - GraphView → vis-network（约 600KB）
//   - Workspace → NoteEditor → Vditor（约 700KB，只有编辑笔记才需要）
// 其余 4 个页面（设置/Token/P2P/个人）完全不需要这两个库。
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

// 侧栏跳转桥：store（组件外 reactive 对象）拿不到 this.$router，
// navigateFromSidebar 经此跳转，与模板内 $router.push 等价
window.__routerPush = (path) => router.push(path);
