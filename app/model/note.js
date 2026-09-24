const {Model} = require('jj.js');

class Note extends Model {
    /**
     * 获取笔记列表
     */
    async getNoteList(condition = {}, rows = 20, page = 1) {
        return await this.db.table('note n')
            .field('n.*, c.name as cate_name, c.is_public')
            .join('cate c', 'n.cate_id=c.id', 'left')
            .where(condition)
            .order('n.is_pinned', 'desc')
            .order('n.sort', 'asc')
            .order('n.add_time', 'desc')
            .paginate({page, page_size: rows});
    }
    
    /**
     * 获取公开笔记列表（前台用）
     *
     * ⚠️ 目前没有调用方（前台走下面的 getPublicNoteList）。若将来要用，
     * 注意这里的 cate_id 是**精确匹配、不展开子分类**的，跟前台"点父分类
     * 连子分类一起列"的预期不一致。
     */
    async getPublicNotes(options = {}) {
        let query = this.db.table('note n')
            .field('n.*, c.name as cate_name')
            .join('cate c', 'n.cate_id=c.id')
            .where({'c.is_public': 1});
        
        if(options.cate_id) {
            query = query.where({'n.cate_id': options.cate_id});
        }
        
        if(options.order) {
            const [field, sort] = options.order.split(' ');
            query = query.order('n.' + field, sort);
        }
        
        if(options.limit) {
            query = query.limit(options.limit);
        }
        
        return await query.select();
    }
    
    /**
     * 获取单篇公开笔记（前台用）
     */
    async getPublicNote(id) {
        return await this.db.table('note n')
            .field('n.*, c.name as cate_name')
            .join('cate c', 'n.cate_id=c.id')
            .where({'n.id': id, 'c.is_public': 1})
            .find();
    }

    /**
     * 获取公开笔记列表（前台用，分页）
     * 与 getPublicNotes 的区别：返回 [列表, 分页对象]，且**不含 content**
     * （正文可能很大，列表页用不上）
     *
     * cate_ids 传的是**分类 id 数组**而不是单个 id：前台点父分类要连子分类的
     * 笔记一起列出来，由调用方先用 cate.getPublicCateIds() 展开好再传进来。
     * 传空数组/不传 == 不按分类过滤（全部公开笔记）。
     */
    async getPublicNoteList(options = {}) {
        let query = this.db.table('note n')
            .field('n.id, n.title, n.keywords, n.add_time, n.update_time, n.cate_id, c.name as cate_name')
            .join('cate c', 'n.cate_id=c.id', 'inner')
            .where({'c.is_public': 1});

        // 空数组要挡住：jj.js 会把 ['in', []] 拼成 `in ()`，是条语法错误的 SQL
        if(options.cate_ids && options.cate_ids.length) {
            query = query.where({'n.cate_id': ['in', options.cate_ids]});
        }
        if(options.keyword) {
            query = query.where('n.title like ?', ['%' + options.keyword + '%']);
        }

        query = query.order('n.is_pinned', 'desc').order('n.add_time', 'desc');
        return await query.paginate({page: options.page, page_size: options.rows});
    }
    
    /**
     * 保存笔记（新增或更新），同时解析双向链接
     */
    async saveNote(data) {
        // 分类处理：
        // - null（前端清除分类）→ 存 0（未分类）
        // - undefined（局部更新，如重命名只传 {id, title}）→ 删除该字段，
        //   保留数据库原值，避免误把分类重置为未分类
        if(data.cate_id === null) {
            data.cate_id = 0;
        } else if(data.cate_id === undefined) {
            delete data.cate_id;
        }

        if(data.id) {
            // 更新笔记
            data.update_time = Math.floor(Date.now() / 1000);
            await this.db.where({id: data.id}).update(data);
            await this.parseLinks(data.id, data.content || '');
            // 返回新版本时间，供调用方刷新乐观锁基准
            return data.update_time;
        } else {
            // 创建笔记
            data.add_time = Math.floor(Date.now() / 1000);
            data.update_time = Math.floor(Date.now() / 1000);
            const result = await this.db.insert(data);
            const newId = result.insertId || result;
            await this.parseLinks(newId, data.content || '');
            return newId;
        }
    }
    
    /**
     * 解析 [[标题]] 双向链接
     */
    async parseLinks(noteId, content) {
        // 清除旧链接
        await this.$db.table('note_link').delete({source_id: noteId});
        
        // 匹配 [[标题]]
        const regex = /\[\[([^\]]+)\]\]/g;
        let match;
        while((match = regex.exec(content)) !== null) {
            const title = match[1].trim();
            const target = await this.$db.table('note')
                .where({title}).find();
            if(target && target.id !== noteId) {
                const exists = await this.$db.table('note_link')
                    .where({source_id: noteId, target_id: target.id}).find();
                if(!exists) {
                    await this.$db.table('note_link').insert({
                        source_id: noteId,
                        target_id: target.id,
                        add_time: Math.floor(Date.now() / 1000)
                    });
                }
            }
        }
    }
    
    /**
     * 获取反向链接
     *
     * ⚠️ 不区分公开/私密，会返回私密笔记的标题 —— 只可用于后台。
     * 前台一律用 getPublicBacklinks，否则公开笔记会泄露"有哪些私密笔记引用了它"
     */
    async getBacklinks(noteId) {
        return await this.db.table('note n')
            .field('n.id, n.title')
            .join('note_link l', 'l.source_id=n.id')
            .where({'l.target_id': noteId})
            .select();
    }

    /**
     * 获取反向链接（前台用）
     * 只返回来源笔记所属分类 is_public=1 的，避免泄露私密笔记标题
     */
    async getPublicBacklinks(noteId) {
        return await this.db.table('note n')
            .field('n.id, n.title')
            .join('note_link l', 'l.source_id=n.id', 'inner')
            .join('cate c', 'n.cate_id=c.id', 'inner')
            .where({'l.target_id': noteId, 'c.is_public': 1})
            .select();
    }
    
    /**
     * 搜索笔记（前台用）
     *
     * 实现说明（踩过的坑，改之前先读）：
     *
     * 1. jj.js 的 where() 只接受 **对象** 形式的条件——_parseWhere 内部是
     *    Object.entries(whereList)，传字符串会被逐字符拆成键值对，直接抛
     *    `item[1].toLowerCase is not a function`。
     *
     * 2. 三条 ['like', ...] 串 or 时，SQL 里 and 优先级高于 or，如果不加括号，
     *    `c.is_public = ? and title like ? or content like ? or keywords like ?`
     *    会被解析成 (公开 and 标题命中) or 正文命中 or 标签命中
     *    —— **私密笔记只要正文命中就会被搜出来**。
     *
     * 3. 所以这里**故意把 OR 组放在第一个 where()**：_parseWhere 结尾有
     *    `where.length > 1 && (where[0] = '(' + where[0] + ')')`，
     *    只有第一项会被自动加括号。后面再追加 is_public / cate_id 这些 AND 条件，
     *    生成的 SQL 就是
     *      where (title like ? or content like ? or keywords like ?) and c.is_public = ? ...
     *    ⚠️ 调整顺序会破坏括号，别把 OR 组挪到后面。
     */
    async searchNotes(q, cateId = 0) {
        const like = '%' + q + '%';

        let query = this.db.table('note n')
            .field('n.id, n.title, n.keywords, n.add_time, c.name as cate_name')
            .join('cate c', 'n.cate_id=c.id', 'inner')
            .where({
                'n.title': ['like', like],
                'n.content': ['like', like, 'or'],
                'n.keywords': ['like', like, 'or']
            })
            .where({'c.is_public': 1});

        if(cateId > 0) {
            query = query.where({'n.cate_id': cateId});
        }

        return await query.order('n.add_time', 'desc').select();
    }
}

module.exports = Note;
