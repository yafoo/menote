const {Controller} = require('jj.js');

class Index extends Controller
{
    middleware = [
        '/install/check'
    ];

    async _init() {
        if(!await this.$model.user.is_login()) {
            return this.$redirect('login/index');
        }
    }
    async index() {
        // Vue3 SPA 入口页面
        await this.$fetch();
    }
}

module.exports = Index;
