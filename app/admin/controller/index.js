const {Controller, Logger} = require('jj.js');
const fs = require('fs');
const {join} = require('path');
const theme = require('../../../lib/theme');

// 后台 SPA 构建产物：由 web/ 的 Vite 工程构建输出（npm run build）
const DIST_HTML = join(__dirname, '../../../public/static/dist/admin.html');

class Index extends Controller
{
    middleware = [
        '/auth/check'
    ];

    async _init() {
        if(!await this.$model.user.is_login()) {
            return this.$redirect('login/index');
        }
    }
    async index() {
        // 直接输出 Vite 构建产物（外壳已带 hash 化的 js/css 引用）。
        // 不再走 jj.js 模板渲染——外壳是纯静态 HTML，不含模板语法。
        // 鉴权仍由上面的 _init 负责，与改造前一致。
        let html;
        try {
            html = await fs.promises.readFile(DIST_HTML, 'utf8');
        } catch(e) {
            Logger.error('[admin] 前端产物缺失，请执行 npm run build：' + DIST_HTML);
            this.ctx.status = 500;
            return this.$show('前端资源未构建，请在项目根目录执行：npm run build');
        }

        // 首屏防闪：把站点默认主题填进外壳里那段内联脚本的占位符，
        // 否则暗色主题下会先闪一帧浅色（见 lib/theme.js）
        const mode = await theme.getSiteTheme(this.$model.site);
        return this.$show(theme.inject(html, mode));
    }
}

module.exports = Index;
