/**
 * @module app
 * @type {import('jj.js/types').RouteConfig}
 */
const routes = [
    // 前台（SSR）
    {url: '/', path: 'home/index/index'},
    {url: '/note/:id.html', path: 'home/index/index'},
    {url: '/cate/:id', path: 'home/index/index'},
    {url: '/search', path: 'home/index/index'},
    {url: '/graph', path: 'home/index/index'},

    // 管理后台（Vue3 SPA 入口）
    {url: '/admin', path: 'admin/index/index'},
    {url: '/admin/login', path: 'admin/login/index'},

    // API 接口（RESTful）
    {url: '/api/:controller/:action', path: '/auth/api', type: 'middleware'},

    // 安装向导
    {url: '/install', path: 'install/index/index'},
    {url: '/install/install', path: 'install/index/install'},

    // 静态资源
    {url: '/static/{*staticfile}', path: async()=>{}},
    {url: '/logo.png', path: async()=>{}},
    {url: '/favicon.ico', path: async()=>{}},
    // 笔记资源
    {url: '/upload/{*notefile}', path: '/auth/notefile', type: 'middleware'},
];

module.exports = routes;
