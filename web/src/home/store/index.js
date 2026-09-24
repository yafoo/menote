import { reactive } from 'vue';
import { api } from '@/home/api/index.js';
import { syncFromSite } from '@/shared/theme.js';

// 前台全局状态。
//
// 刻意用 reactive 对象而不是 Pinia：前台只有"站点配置 + 分类树"这点共享数据，
// 引入状态库不划算，也和后台 store 的写法保持一致。

export const store = reactive({
    site: {},
    cates: [],
    ready: false,

    // 最近一次设置的标题主体（不含站点名）。见 setTitle / applyTitle
    titleSub: '',

    // 拉站点信息与分类树（header 导航用）。只拉一次
    async init() {
        if(this.ready) return;
        try {
            const res = await api.config();
            if(res.state === 1) {
                this.site = res.data.site || {};
                this.cates = res.data.cates || [];
            }
        } catch(e) {
            // 拉不到不该把整个页面卡住：导航区空着，正文页各自还会拉自己的接口
            console.error('加载站点配置失败', e);
        }
        // 站点默认主题的兜底：正常情况下首屏脚本已经从服务端注入的外壳里读到了
        // （见 lib/theme.js），这里只是万一外壳没被注入时（静态缓存、dev server
        // 直出）再对齐一次。本机手动选过的用户不受影响
        syncFromSite(this.site.theme);
        this.ready = true;
        // 站点名到位后重套一次标题，见 setTitle 的说明
        this.applyTitle();
    },

    // SPA 没有服务端渲染，标题只能前端设。
    // 各页是在自己的 onMounted 里调它的，而那时 /api/pub/config 可能还没回来，
    // 拿不到站点名、只能退回兜底的 'MeNote'——标题对不对取决于两个请求的先后。
    // 所以这里把主体记下来，等 init 拿到配置后再套一次，彻底消除时序依赖
    setTitle(sub) {
        this.titleSub = sub || '';
        this.applyTitle();
    },

    applyTitle() {
        const name = this.site.sitename || 'MeNote';
        document.title = this.titleSub ? `${this.titleSub} - ${name}` : name;
    }
});
