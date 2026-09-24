const {Model} = require('jj.js');

class Site extends Model {
    /**
     * 获取站点配置
     */
    async getConfig() {
        const list = await this.db.select();
        const config = {};
        for(const item of list) {
            config[item.key] = item.value;
        }
        return config;
    }
    
    /**
     * 保存配置
     */
    async saveConfig(key, value) {
        const item = await this.db.where({key}).find();
        if(item) {
            return await this.db.where({key}).update({value});
        } else {
            return await this.db.insert({key, value, group: 'basic', type: 'input', title: key});
        }
    }

    /**
     * 确保某个配置项存在（不存在才插入，幂等，不会覆盖已有值）
     *
     * menote_site 是自由键值表，后台设置页渲染的就是这张表的行——表里没有的行
     * 页面上根本不会出现。所以后来新增的配置项（比如 theme）在老库上需要补一行，
     * 否则管理员打开设置页看不到这一项，也没法改。
     *
     * @param {string} key 配置键
     * @param {object} defaults 补行时的 group/type/title/value/tips/sort
     */
    async ensureConfig(key, defaults = {}) {
        const item = await this.db.where({key}).find();
        if(item) return item;

        await this.db.insert({
            key,
            value: '',
            group: 'basic',
            type: 'input',
            title: key,
            ...defaults
        });
        return await this.db.where({key}).find();
    }
}

module.exports = Site;
