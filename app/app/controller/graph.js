const Base = require('./base');

// 知识图谱 /graph —— 已迁到 Vue SPA，这里只输出 SPA 外壳
// 图谱数据由前端调 /api/pub/graph 拉取
//
// 原实现（见 git 历史）有两个问题，迁移时已在 app/api/controller/pub.js 修掉：
//   1. `note_link` 全表 select，会把「私密 ↔ 私密」的链接一并吐给匿名访问者，
//      泄露私密笔记的数量与关联结构
//   2. 用 $assign 把 JSON 字符串塞进模板，靠 {{@nodes}} 原样输出，属注入面
class Graph extends Base
{
    async graph() {
        return await this.spa();
    }
}

module.exports = Graph;
