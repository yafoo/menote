const Base = require('./base');

// 笔记详情 /note/:id.html —— 已迁到 Vue SPA，这里只输出 SPA 外壳
// 页面数据由前端调 /api/pub/note?id= 拉取
//
// ⚠️ 注意 "笔记不存在或未公开" 的判断已移到前端：服务端不再区分，
// 统一返回外壳，由前端根据接口结果渲染提示。这样做的原因是路由参数
// （id 是否有效）属于数据层面的事，服务端为它单独返回 404 会让 SPA 的
// 刷新体验不一致（刷新时看到错误页，前端导航时看到提示）。
class Note extends Base
{
    async note() {
        return await this.spa();
    }
}

module.exports = Note;
