const Base = require('./base');

// 前台首页 / —— 已迁到 Vue SPA，这里只输出 SPA 外壳
// 页面数据由前端调 /api/pub/notes 拉取
class Index extends Base
{
    async index() {
        return await this.spa();
    }
}

module.exports = Index;
