// MeNote 前台入口
//
// 前台刻意**不引 Element Plus**：只有列表/详情/图谱三种页面，原生 CSS 足够，
// 引组件库会让首屏凭空多几百 KB。Vditor 与 vis-network 都在各自页面里
// 动态 import，不进首屏。
//
// 注意与后台的差异：前台用 history 路由（URL 要保持 /note/123.html 这种干净形式），
// 后台用 hash 路由。
import './styles/home.css';

import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router/index.js';

createApp(App).use(router).mount('#app');
