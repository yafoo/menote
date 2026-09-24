const Base = require('./base');

// 搜索页 /search?q= —— 已迁到 Vue SPA，这里只输出 SPA 外壳
// 搜索由前端调 /api/pub/search 完成（关键词从 location query 里取）
class Search extends Base
{
    async search() {
        return await this.spa();
    }
}

module.exports = Search;
