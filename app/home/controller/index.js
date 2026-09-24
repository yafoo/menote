const {Controller, Logger} = require('jj.js');
const fs = require('fs');
const {join} = require('path');
const theme = require('../../../lib/theme');

// 前台 SPA 构建产物：由 web/ 的 Vite 工程构建输出（npm run build）
// 注意路径里的 public/ 是 jj.js 的静态目录（config/app.js 的 static_dir），
// 而文件名 home.html 对应 web/home.html 这个入口——两者不是一回事
const DIST_HTML = join(__dirname, '../../../public/static/dist/home.html');

/**
 * 前台基类
 *
 * 前台已从「jj.js 模板 SSR」迁到「Vue SPA」：
 * /、/note/:id.html、/cate/:id、/search、/graph 这 5 条路由全部返回同一份
 * 构建产物，页面内容由前端 vue-router + /api/pub/* 接管。
 *
 * ⚠️ config/routes.js 里这 5 条路由**必须保留**。SPA 用 history 路由，
 * 直接访问或刷新 /note/123.html 时浏览器是先请求服务端的，服务端若没有
 * 对应路由就会 404——此时 SPA 外壳还没加载，前端路由根本没机会介入。
 *
 * 各控制器现在是薄壳（只调 this.spa()）。保留 1:1 的控制器文件而不是
 * 全部指向同一个 action，是为了：路由名（name: 'note' 等）不变、
 * 将来某个页面要加服务端逻辑（比如给详情页注入 SSR meta 标签）时有现成位置。
 *
 * 代价：SPA 没有服务端渲染，<title> 只能前端设置，搜索引擎收录不如原 SSR。
 */
class Index extends Controller
{
    middleware = [
        '/auth/check'
    ];

    // 原 SSR 版本在这里查站点配置和公开分类树并 $assign 给模板。
    // SPA 后这两份数据由前端调 /api/pub/config 拉取，服务端不必再查
    // ——省掉每次前台页面加载的 2 次数据库查询
    async _init() {}

    async index() {
        return await this.spa();
    }

    /**
     * 输出前台 SPA 外壳
     */
    async spa() {
        let html;
        try {
            html = await fs.promises.readFile(DIST_HTML, 'utf8');
        } catch(e) {
            Logger.error('[app] 前端产物缺失，请执行 npm run build：' + DIST_HTML);
            this.ctx.status = 500;
            return this.$show('前端资源未构建，请在项目根目录执行：npm run build');
        }

        // 首屏注入：把站点默认主题和站点名填进外壳里的占位符。
        // 主题不注入的话，暗色访客会先看到一帧浅色再跳成暗色；站点名不注入的话，
        // <title> 会先显示兜底名再跳成站点名（前端 store.applyTitle 才拿到 sitename）。
        // 这个读取带 5 秒内存缓存，不是每次请求都查库（见 lib/theme.js）
        const vars = await theme.getShellVars(this.$model.site);
        return this.$show(theme.inject(html, vars));
    }
}

module.exports = Index;
