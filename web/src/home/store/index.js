import { reactive } from 'vue';
import { api } from '@/home/api/index.js';

// 前台全局状态。
//
// 刻意用 reactive 对象而不是 Pinia：前台只有"站点配置 + 分类树"这点共享数据，
// 引入状态库不划算，也和后台 store 的写法保持一致。

export const store = reactive({
    site: {},
    cates: [],
    ready: false,

    // 拉站点信息与分类树（header 导航用）。只拉一次
    async init() {
        if(this.ready) return;
        const res = await api.config();
        if(res.state === 1) {
            this.site = res.data.site || {};
            this.cates = res.data.cates || [];
        }
        this.ready = true;
    },

    // SPA 没有服务端渲染，标题只能前端设
    setTitle(sub) {
        const name = this.site.sitename || 'MeNote';
        document.title = sub ? `${sub} - ${name}` : name;
    }
});
