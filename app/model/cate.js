const {Model} = require('jj.js');

class Cate extends Model {
    /**
     * 获取分类树（后台用，包含所有分类）
     */
    async getCateTree() {
        const list = await this.db.order('sort', 'asc').select();
        return this.buildTree(list, 0);
    }
    
    /**
     * 获取公开分类树（前台用）
     */
    async getPublicCateTree() {
        const list = await this.db.where({is_public: 1, is_show: 1})
            .order('sort', 'asc').select();
        return this.buildTree(list, 0);
    }
    
    /**
     * 取某个分类及其全部公开子孙分类的 id
     *
     * 前台按分类浏览时要连子分类一起算——父分类只查自己那一层的话，
     * 点"生活随笔"看不到挂在"测试分类"（它的子分类）下面的笔记。
     *
     * ⚠️ 只收集 is_public = 1 的子孙，这是安全边界而不是优化：
     * "公开父分类 → 私密子分类"是很自然的结构（本项目就是
     * 生活随笔(公开) > 测试分类(公开) > 三级分类(私密)），
     * 把私密子分类的 id 一起带进查询虽然会被 getPublicNoteList 的
     * c.is_public = 1 兜住，但那是"恰好还有一层防线"，不该依赖。
     *
     * is_show 不参与过滤：它只控制导航显不显示，后台也没有开关（只有公开/私密），
     * 与"数据能不能被看到"无关。
     */
    async getPublicCateIds(id) {
        const cateId = Number(id);
        const list = await this.db.field('id, pid').where({is_public: 1}).select();

        const ids = new Set([cateId]);
        // 逐层向下收集。分类只有几十个量级，O(n²) 也无所谓，胜在直白。
        // ids 兼作环检测：pid 万一被配成环也不会死循环
        let changed = true;
        while(changed) {
            changed = false;
            for(const item of list) {
                if(ids.has(item.pid) && !ids.has(item.id)) {
                    ids.add(item.id);
                    changed = true;
                }
            }
        }

        return [...ids];
    }

    /**
     * 构建树形结构
     */
    buildTree(list, pid) {
        const tree = [];
        for(const item of list) {
            if(item.pid === pid) {
                item.children = this.buildTree(list, item.id);
                tree.push(item);
            }
        }
        return tree;
    }
    
    /**
     * 批量更新排序
     */
    async batchSort(items) {
        for(const item of items) {
            await this.db.where({id: item.id}).update({
                sort: item.sort,
                pid: item.pid
            });
        }
        return true;
    }
    
    /**
     * 保存分类
     */
    async saveCate(data) {
        if(data.id) {
            return await this.db.where({id: data.id}).update(data);
        } else {
            data.add_time = Math.floor(Date.now() / 1000);
            return await this.db.insert(data);
        }
    }
}

module.exports = Cate;
