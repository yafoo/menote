const {Controller} = require('jj.js');

class Login extends Controller
{
    middleware = [
        '/install/check'
    ];

    async index() {
        if(this.$request.isPost()) {
            const username = this.$request.post('username');
            const password = this.$request.post('password');
            if(!username) {
                return this.$error('用户名不能为空！');
            } else if(!password) {
                return this.$error('密码不能为空！');
            }

            const err = await this.$model.user.login(username, password);
            if(err) {
                return this.$error(err);
            } else {
                this.$success('登录成功！', '/admin');
            }
        } else {
            if(await this.$model.user.is_login()) {
                return this.$redirect('index/index');
            }
            await this.$fetch();
        }
    }

    async logout() {
        await this.$model.user.logout();
        this.$success('退出成功！', 'login/index');
    }
}

module.exports = Login;
