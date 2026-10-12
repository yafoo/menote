const {Controller, loader} = require('jj.js');
const {version: VERSION} = require('../../../package.json');
const {readFile, writeFile} = require('fs').promises;
// jj.js 1.2 把 this.$xxx 放在 AsyncLocalStorage 里。sqlite3 的原生回调
// 不会把这份上下文带进来，startTrans(fn) 又是在那个回调里直接调用 fn。
const storage = require('jj.js/lib/storage');

class Index extends Controller
{
    async _init() {
        this.base_dir = this.$config.app.base_dir;
        this.lockFile = this.base_dir + '/config/lock.js';
        this.sqlFile = this.base_dir + '/app/install/menote_sqlite.sql';

        if(await this._isInstalled()) {
            return this.$error('系统已安装！', '/');
        }

        this.$assign('VERSION', VERSION);
        this.$assign('APP_TIME', this.ctx.APP_TIME);
    }

    async _isInstalled() {
        if(this.$config.lock) {
            return true;
        }
        if(await this.$.utils.fs.isFile(this.lockFile)) {
            return true;
        }
        return false;
    }

    async index() {
        await this.$fetch();
    }

    async install() {
        if(!this.$request.isPost()) {
            return this.$error('非法请求！');
        }

        const username = this.$request.post('username');
        const password = this.$request.post('password');
        if(!username || !password) {
            return this.$error('用户名或密码不能为空！');
        }

        try {
            await this._initDatabase(username, password);
            await this._writeLockFile();
            loader.clearPathCache();
            this.$success('安装成功！', '/admin');
        } catch(e) {
            this.$logger.debug(e);
            this.$error(e.message || '安装出错！');
        }
    }

    /**
     * 初始化数据库
     */
    async _initDatabase(username, password) {
        const sql = await readFile(this.sqlFile, 'utf8');
        // 使用更健壮的分隔方式
        const statements = sql.split(/;\s*\n/).filter(s => s.trim());
        const db = this.$db;
        const requestStore = storage.getStore();

        await db.startTrans(async () => {
            await storage.run(requestStore, async () => {
                // 执行建表语句
                for(const stmt of statements) {
                    const s = stmt.trim();
                    if(s) await db.query(s);
                }

                // 创建管理员用户（固定 id=1，重装时覆盖而非新增）
                const exists = await db.table('user').where({id: 1}).count();
                if(exists) {
                    await this.$model.user.saveUser({id: 1, username, password});
                } else {
                    await this.$model.user.saveUser({username, password});
                }

                // 插入默认站点配置（先检查是否已存在，避免重装时重复）
                const siteData = [
                    {group: 'basic', type: 'input', key: 'sitename', title: '站点名称', value: 'MeNote', tips: '', sort: 0},
                    {group: 'basic', type: 'textarea', key: 'description', title: '站点描述', value: '我的个人知识库', tips: '', sort: 1},
                    {group: 'display', type: 'input', key: 'list_rows', title: '列表条数', value: '20', tips: '', sort: 0},
                ];
                for(const item of siteData) {
                    const exists = await db.table('site').where({key: item.key}).count();
                    if(!exists) {
                        await db.table('site').insert(item);
                    }
                }
            });
        });
    }

    /**
     * 写入锁定文件
     */
    async _writeLockFile() {
        const lock_content = `// 本文件标识系统已安装，不可删除。
module.exports = {
    install: true,
    version: '${VERSION}'
};`;
        await writeFile(this.lockFile, lock_content);
    }
}

module.exports = Index;
