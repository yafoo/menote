const {Middleware} = require('jj.js');
const TokenModel = require('../model/token');

// 控制器+方法 -> 所需权限 映射表
// 新增控制器时在此扩展即可；token 管理本身仅限 Cookie 登录（admin后台）操作
const PERM_MAP = {
    cate: {
        tree:   TokenModel.PERM_CATE_READ,
        list:   TokenModel.PERM_CATE_READ,
        create: TokenModel.PERM_CATE_CREATE,
        edit:   TokenModel.PERM_CATE_EDIT,
        sort:   TokenModel.PERM_CATE_EDIT,
        delete: TokenModel.PERM_CATE_DELETE,
    },
    note: {
        list:   TokenModel.PERM_NOTE_READ,
        detail: TokenModel.PERM_NOTE_READ,
        create: TokenModel.PERM_NOTE_CREATE,
        edit:   TokenModel.PERM_NOTE_EDIT,
        pin:    TokenModel.PERM_NOTE_EDIT,
        sort:   TokenModel.PERM_NOTE_EDIT,
        delete: TokenModel.PERM_NOTE_DELETE,
    }
};

class Auth extends Middleware
{
    async api() {
        // 前台公开接口：匿名可访问，不做任何认证。
        // ⚠️ 放行意味着 pub 控制器自己承担全部数据边界责任——它的每个方法都必须
        // 只返回 is_public=1 分类下的数据（见 app/api/controller/pub.js 顶部说明）。
        // 新增控制器时若想走这条路，请确认它同样没有写操作、不碰私密数据。
        if(this.ctx.params.controller === 'pub') {
            return await this.$next();
        }

        // 先检查 Cookie 认证（管理后台）：不受 token 权限限制，拥有全部权限
        if(await this.$model.user.is_login()) {
            this.$logger.debug('Cookie 认证成功，跳过 token 认证');
            return await this.$next();
        }

        // 再检查 Token 认证（外部 API）
        let tokenStr = this.$request.get('token', '');
        if(!tokenStr) {
            const authHeader = this.$request.header('authorization') || '';
            if(authHeader.startsWith('Bearer ')) {
                tokenStr = authHeader.substring(7);
            }
        }

        if(!tokenStr) {
            return this.$error('未登录或Token缺失');
        }

        // 查询 token（含过期检查）
        const token = await this.$model.token.getTokenByValue(tokenStr);

        if(!token) {
            return this.$error('Token无效或已过期');
        }

        // Token 只能访问白名单里的控制器（cate/note），其他接口一律拒绝
        const ctrl = this.ctx.params.controller;
        const action = this.ctx.params.action;

        const requiredPerm = PERM_MAP[ctrl]?.[action] || 0;
        if(!requiredPerm) {
            this.$logger.debug(`Token 访问受限: ${ctrl}/${action} 不在白名单内`);
            return this.$error('该接口不支持 Token 访问');
        }

        if(requiredPerm && !this.$model.token.hasPermission(token, requiredPerm)) {
            this.$logger.debug('Token 权限不足');
            return this.$error('权限不足');
        }

        this.$logger.debug('Token 认证通过');
        await this.$next();
    }

    async notefile() {
        if(await this.$model.user.is_login()) return;
        const notefile = this.$request.param('notefile');this.$logger.info(notefile);
        if(!notefile) return;
        const filepath = '/upload/' + notefile.split('?')[0];this.$logger.info(filepath);
        const note_id = await this.$db.table('attach').where({filepath}).withCache(600).value('note_id');this.$logger.info(note_id);
        if(!note_id) return;
        const cate_id = await this.$db.table('note').where({id: note_id}).value('cate_id');this.$logger.info(cate_id);
        if(!cate_id) return;
        const is_public = await this.$db.table('cate').where({id: cate_id}).value('is_public');this.$logger.info(is_public);
        if(is_public == 1) return;
        this.$logger.warning('Unauthorized access to private note file: ' + notefile);
        this.ctx.status = 403;
    }
}

module.exports = Auth;
