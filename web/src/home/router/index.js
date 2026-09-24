import { createRouter, createWebHistory } from 'vue-router';

// 前台用 **history 模式**（不是后台那种 hash 模式）。
//
// 原因：前台是公开博客，URL 需要保持干净且与迁移前完全一致
// （/note/123.html、/cate/1、/search?q=x、/graph），否则已分享的链接、
// 收藏、搜索引擎索引全部失效。改成 /#/note/123 是不可接受的回归。
//
// 服务端配合：config/routes.js 里这 5 条路由仍然存在，对应的控制器
// 改成输出构建好的 home.html（不再 $fetch 渲染模板），
// 因此刷新任意前台 URL 都能拿到 SPA 外壳，再由前端路由接管。
//
// 页面全部懒加载，且两个重依赖被隔离在各自的页面 chunk 里：
//   NoteView  → vditor（约 291KB，只有看笔记详情才需要）
//   GraphView → vis-network（约 615KB，只有看图谱才需要）

const routes = [
    {path: '/', name: 'home', component: () => import('@/home/views/HomeView.vue')},
    // 保留 .html 后缀。id 用自定义正则限定为数字，避免把 .html 吃进参数
    {path: '/note/:id(\\d+).html', name: 'note', component: () => import('@/home/views/NoteView.vue')},
    {path: '/cate/:id(\\d+)', name: 'cate', component: () => import('@/home/views/CateView.vue')},
    {path: '/search', name: 'search', component: () => import('@/home/views/SearchView.vue')},
    {path: '/graph', name: 'graph', component: () => import('@/home/views/GraphView.vue')},
    // 兜底：未知路径回首页（旧版 SSR 会 404，这里给个更友好的行为）
    {path: '/:pathMatch(.*)*', redirect: '/'}
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior(to, from, savedPosition) {
        return savedPosition || {top: 0};
    }
});
