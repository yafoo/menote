const Base = require('./base');
const theme = require('../../../lib/theme');

/**
 * 前台公开接口（匿名可访问）
 *
 * ⚠️ 与 /api/ 下其他控制器不同，本控制器**不走认证**——
 * app/middleware/auth.js 里对 controller === 'pub' 直接放行。
 *
 * 因此每个方法都必须自己保证只暴露公开数据。本项目的"公开"定义是
 * **笔记所属分类 menote_cate.is_public = 1**（注意是分类级别的开关，
 * 没有笔记级别的开关）。所有查询一律 INNER JOIN menote_cate 并带 is_public=1。
 *
 * 新增方法时务必自查三件事：
 *   1. 是否 INNER JOIN 了 cate 且过滤 is_public=1（LEFT JOIN 会让未分类笔记漏出来）
 *   2. 返回的字段里有没有 content / 附件路径这类不该给匿名用户的东西
 *   3. 有没有间接泄露私密笔记的"存在"（数量、标题、ID、链接关系）
 */
class Pub extends Base
{
    // 站点信息 + 公开分类树
    async config() {
        const [config, cates] = await Promise.all([
            this.$model.site.getConfig(),
            this.$model.cate.getPublicCateTree()
        ]);

        // 只暴露白名单里的 key。menote_site 是自由键值表（管理员在后台随意增删），
        // 整表返回等于替管理员决定"这些都可以公开"——将来他加个不想公开的字段就泄露了
        //
        // theme 在这里是"站点默认主题"：首屏脚本已经由服务端注入过一次
        // （lib/theme.js），这里是给前端做兜底同步用的（外壳被静态缓存、
        // dev server 直出等场景下注入会失效）
        const PUBLIC_KEYS = ['sitename', 'description', 'keywords', 'siteurl', 'beian', 'theme'];
        const site = {};
        for(const key of PUBLIC_KEYS) {
            if(config[key] === undefined) continue;
            // 枚举值不能原样透出：库里万一存了脏值，前端会拿它去套 CSS 属性
            site[key] = key === 'theme' ? theme.normalize(config[key]) : config[key];
        }

        this.$success('success', {site, cates});
    }

    // 公开笔记列表（分页）
    async notes() {
        const page = Math.max(1, parseInt(this.$request.get('page', 1)) || 1);
        const rows = Math.min(50, Math.max(1, parseInt(this.$request.get('rows', 20)) || 20));
        const cateId = parseInt(this.$request.get('cate_id', 0)) || 0;

        // 点父分类要连子分类的笔记一起列（否则"生活随笔"里看不到它子分类
        // "测试分类"下的笔记）。展开只走 is_public = 1 的子孙，
        // 挂在公开分类底下的私密子分类不会被带进来——见 cate.getPublicCateIds
        const cateIds = cateId ? await this.$model.cate.getPublicCateIds(cateId) : undefined;

        const [list, pagination] = await this.$model.note.getPublicNoteList({
            cate_ids: cateIds,
            page,
            rows
        });

        this.$success('success', {list, page, rows, total: pagination.total()});
    }

    // 单篇公开笔记详情 + 反向链接
    async note() {
        const id = parseInt(this.$request.get('id', 0)) || 0;
        if(!id) return this.$error('缺少id参数');

        const note = await this.$model.note.getPublicNote(id);
        if(!note) return this.$error('笔记不存在或未公开');

        // 必须用 getPublicBacklinks：getBacklinks 会把私密笔记的标题也带出来
        note.backlinks = await this.$model.note.getPublicBacklinks(id);

        this.$success('success', note);
    }

    // 搜索公开笔记
    async search() {
        const q = String(this.$request.get('q', '') || '').trim();
        const cateId = parseInt(this.$request.get('cate_id', 0)) || 0;

        if(!q) {
            return this.$success('success', {list: [], q, cate_id: cateId});
        }

        // searchNotes 内部已过滤 c.is_public = 1
        const list = await this.$model.note.searchNotes(q, cateId);
        this.$success('success', {list, q, cate_id: cateId});
    }

    // 知识图谱：公开笔记节点 + 两端都公开的链接
    async graph() {
        const nodes = await this.$db.table('note n')
            .field('n.id, n.title, n.cate_id, c.name as cate_name')
            .join('cate c', 'n.cate_id=c.id', 'inner')
            .where({'c.is_public': 1})
            .select();

        // ⚠️ 两端都必须是公开笔记。
        // 旧 SSR 版本这里是 `note_link` 全表 select，会把「私密 ↔ 私密」的边
        // 一并吐给匿名访问者——等于泄露私密笔记的数量和关联结构。
        // 这里用四个 INNER JOIN 把两端都卡在 is_public=1 上（也不用拼 IN 占位符，
        // 不受 SQLite 变量数上限影响）
        const links = await this.$db.table('note_link l')
            .field('l.source_id, l.target_id')
            .join('note s', 's.id=l.source_id', 'inner')
            .join('note t', 't.id=l.target_id', 'inner')
            .join('cate cs', 'cs.id=s.cate_id', 'inner')
            .join('cate ct', 'ct.id=t.cate_id', 'inner')
            .where({'cs.is_public': 1, 'ct.is_public': 1})
            .select();

        this.$success('success', {
            nodes,
            edges: links.map(link => ({from: link.source_id, to: link.target_id}))
        });
    }
}

module.exports = Pub;
