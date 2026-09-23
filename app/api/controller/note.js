const Base = require('./base');
const fs = require('fs');
const {join} = require('path');

class Note extends Base
{
    async list() {
        const page = parseInt(this.$request.get('page', 1)) || 1;
        const rows = parseInt(this.$request.get('rows', 20)) || 20;
        const cateId = parseInt(this.$request.get('cate_id', 0)) || 0;
        const keyword = this.$request.get('keyword', '');
        const q = this.$request.get('q', '');

        const condition = {};
        if(cateId > 0) condition['n.cate_id'] = cateId;
        if(keyword) condition['n.keywords'] = ['like', '%' + keyword + '%'];
        if(q) condition['n.title'] = ['like', '%' + q + '%'];

        const [list, pagination] = await this.$model.note.getNoteList(condition, rows, page);
        this.$success('success', {list, page, rows, total: pagination.total()});
    }

    async detail() {
        const id = this.$request.get('id', 0);
        if(!id) return this.$error('缺少id参数');

        const note = await this.$db.table('note n')
            .field('n.*, c.name as cate_name')
            .join('cate c', 'n.cate_id=c.id', 'left')
            .where({'n.id': id})
            .find();
        
        if(!note) return this.$error('笔记不存在');

        // 获取反向链接
        const backlinks = await this.$model.note.getBacklinks(id);
        note.backlinks = backlinks;

        this.$success('success', note);
    }

    async create() {
        if(!this.$request.isPost()) return this.$error('请使用POST请求');

        const data = this.$request.postAll();
        if(!data.title) return this.$error('标题不能为空');

        const id = await this.$model.note.saveNote(data);
        if(id) {
            this.$success('创建成功', {id});
        } else {
            this.$error('创建失败');
        }
    }

    async edit() {
        if(!this.$request.isPost()) return this.$error('请使用POST请求');

        const data = this.$request.postAll();
        if(!data.id) return this.$error('缺少id参数');

        const note = await this.$db.table('note').where({id: data.id}).find();
        if(!note) return this.$error('笔记不存在');

        // 乐观锁：请求携带客户端加载数据时的 update_time，与数据库当前值不一致，
        // 说明其他地方（另一窗口/设备/外部 API）已编辑保存过，拒绝本次保存防止覆盖。
        // 未携带 update_time 的调用（旧客户端、外部 API 局部更新）不校验，保持兼容。
        if(data.update_time !== undefined && data.update_time !== null
            && Number(note.update_time) !== Number(data.update_time)) {
            return this.$error('保存失败：该笔记已在其他地方被修改，请先备份本地内容，重新获取数据后再编辑保存', {conflict: true, update_time: note.update_time});
        }

        const result = await this.$model.note.saveNote(data);
        if(result) {
            // 返回新的 update_time，前端刷新本地乐观锁基准（否则连续保存会自我冲突）
            this.$success('保存成功', {update_time: result});
        } else {
            this.$error('保存失败');
        }
    }

    async delete() {
        const id = this.$request.get('id', 0);
        if(!id) return this.$error('缺少id参数');

        try {
            // 先取出附件清单，事务提交成功后再物理删文件——
            // 反过来做的话，事务一旦回滚，磁盘文件已经没了，笔记还在但附件全 404
            const attaches = await this.$db.table('attach')
                .where({note_id: id})
                .field('filepath')
                .select();

            await this.$db.startTrans(async () => {
                await this.$db.table('attach').delete({note_id: id});
                await this.$db.table('note').delete({id});
                await this.$db.table('note_link').delete({source_id: id});
                await this.$db.table('note_link').delete({target_id: id});
            });

            await this.removeAttachFiles(attaches);
            this.$success('删除成功');
        } catch(e) {
            this.$error('删除失败：' + e.message);
        }
    }

    /**
     * 物理删除附件文件。两种情况不删磁盘文件，只删 attach 表记录：
     * 1. attach 表还有其他记录指向同一路径（同一文件被多篇笔记上传/引用）
     * 2. 其他笔记的正文里还直接写着这个 URL（文件归属那篇笔记已删，但别处还在用）
     * 第 2 种情况不补数据：Markdown 正文里的 URL 只是文本，没有引用关系可维护。
     */
    async removeAttachFiles(attaches) {
        if(!attaches || attaches.length === 0) return;

        const uploadDir = join(this.$config.app.static_dir.static_dir, 'upload');

        for(const attach of attaches) {
            if(!attach.filepath) continue;

            // 本笔记的 attach 记录已在事务里删掉，这里查到的一定是别的记录在引用
            const remain = await this.$db.table('attach')
                .where({filepath: attach.filepath}).count();
            if(remain > 0) {
                this.$logger.info('附件被其他记录引用，仅删除记录: ' + attach.filepath);
                continue;
            }

            // 正文里还引用着就保留磁盘文件（LIKE 通配符只会让匹配更宽松，
            // 误判方向是"多保留"而不是"多删除"，安全）
            const referenced = await this.$db.table('note')
                .where({content: ['like', '%' + attach.filepath + '%']})
                .count();
            if(referenced > 0) {
                this.$logger.info('附件被其他笔记正文引用，仅删除记录: ' + attach.filepath);
                continue;
            }

            // filepath 形如 /upload/2026/0923/xxx.png，去掉 /upload/ 前缀拼成磁盘路径
            const rel = attach.filepath.startsWith('/upload/')
                ? attach.filepath.substring('/upload/'.length)
                : attach.filepath.replace(/^\//, '');
            const fullpath = join(uploadDir, rel);

            try {
                await fs.promises.unlink(fullpath);
            } catch(e) {
                // 文件不存在或删不掉不阻断删除主流程，只记日志
                this.$logger.warning('删除附件文件失败: ' + fullpath + ' (' + e.message + ')');
            }
        }
    }

    async sort() {
        if(!this.$request.isPost()) return this.$error('请使用POST请求');

        const items = this.$request.post('items', []);
        if(!Array.isArray(items) || items.length === 0) {
            return this.$error('参数错误');
        }

        try {
            for(const item of items) {
                await this.$db.table('note').where({id: item.id}).update({sort: item.sort});
            }
            this.$success('排序已保存');
        } catch(e) {
            this.$error('保存失败：' + e.message);
        }
    }

    async backlinks() {
        const id = this.$request.get('id', 0);
        if(!id) return this.$error('缺少id参数');

        const backlinks = await this.$model.note.getBacklinks(id);
        this.$success('success', backlinks);
    }

    async pin() {
        if(!this.$request.isPost()) return this.$error('请使用POST请求');

        const id = this.$request.post('id', 0);
        const isPinned = this.$request.post('is_pinned', 0);

        if(!id) return this.$error('缺少id参数');

        try {
            // 仅改置顶标记，不更新 update_time：避免纯置顶操作让其他端
            // 正在编辑的笔记产生虚假的乐观锁冲突
            await this.$db.table('note').where({id}).update({
                is_pinned: isPinned ? 1 : 0
            });
            this.$success(isPinned ? '已置顶' : '已取消置顶');
        } catch(e) {
            this.$error('操作失败：' + e.message);
        }
    }
}

module.exports = Note;
