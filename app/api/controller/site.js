const Base = require('./base');
const theme = require('../../../lib/theme');

class Site extends Base
{
    async get() {
        // 早期安装的库里没有 theme 这一行，而设置页渲染的就是 menote_site 的行——
        // 缺行 = 页面上看不到这一项，管理员也就没法改主题。
        // 在这里补一次（幂等，不覆盖已有值），比要求用户手动执行 SQL 友好
        await this.$model.site.ensureConfig('theme', {
            value: 'auto',
            group: 'display',
            type: 'select',
            title: '主题',
            tips: '前台与后台的默认配色。访客在本机手动选过的主题优先于此设置'
        });

        const config = await this.$model.site.db.select();
        this.$success('success', config);
    }

    async save() {
        if(!this.$request.isPost()) return this.$error('请使用POST请求');

        const data = this.$request.postAll();
        if(!data.items || !Array.isArray(data.items)) {
            return this.$error('参数错误');
        }

        // 枚举型配置项先校验再落库。前端读到非法值虽然会退回默认
        // （lib/theme.js 的 normalize 兜了底），但没必要让脏数据进库
        for(const item of data.items) {
            if(item.key === 'theme' && theme.MODES.indexOf(String(item.value)) < 0) {
                return this.$error('主题取值不合法，只能是 auto / light / dark');
            }
        }

        try {
            for(const item of data.items) {
                await this.$model.site.saveConfig(item.key, item.value);
            }
            // 主题值会被注入外壳 HTML 的首屏脚本（见 lib/theme.js），那边带 5 秒
            // 缓存——保存后主动清掉，管理员刷新立刻见效，不用等窗口过期
            theme.clearCache();
            this.$success('保存成功');
        } catch(e) {
            this.$error('保存失败：' + e.message);
        }
    }
}

module.exports = Site;
