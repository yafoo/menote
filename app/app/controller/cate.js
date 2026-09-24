const Base = require('./base');

// 分类页 /cate/:id —— 已迁到 Vue SPA，这里只输出 SPA 外壳
// 页面数据由前端调 /api/pub/notes?cate_id= 拉取；分类名从 /api/pub/config
// 返回的公开分类树里查（不再需要单独的"取分类"公开接口）
//
// 原 SSR 的"分类不存在或未公开"判断移到前端：前端在公开分类树里查不到
// 就渲染提示，行为一致
class Cate extends Base
{
    async cate() {
        return await this.spa();
    }
}

module.exports = Cate;
