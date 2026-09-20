const {Model, utils: {md5}} = require('jj.js');

class User extends Model {
    async is_login() {
        const userId = this.$cookie.get('user');
        if(userId) {
            const user = await this.$db.table('user').where({id: userId}).find();
            return user || null;
        }
        return null;
    }

    /**
     * 保存用户（新增或更新）
     */
    async saveUser(data) {
        if(data.id) {
            const updateData = {username: data.username};
            if(data.password) {
                updateData.salt = this.randomString(8);
                updateData.password = this.passmd5(data.password, updateData.salt);
                updateData.is_lock = -5;
            }
            return await this.db.where({id: data.id}).update(updateData);
        } else {
            const salt = this.randomString(8);
            const pwd = this.passmd5(data.password, salt);
            return await this.db.insert({
                username: data.username,
                password: pwd,
                salt: salt,
                add_time: Math.floor(Date.now() / 1000)
            });
        }
    }
    
    /**
     * 登录
     */
    async login(username, password) {
        const user = await this.get({username});

        if(!user) {
            return '账号或密码错误！';
        }

        if(this.is_lock(user)) {
            return '账号已被锁定，请联系管理员！';
        }

        if(user.password != this.passmd5(password, user.salt)) {
            await this.inc_lock(user.id);
            return user.is_lock < -2 ? '账号或密码错误！' : '密码剩余次数：' + (1 - user.is_lock);
        }

        await this.db.update({is_lock: -5, login_time: Math.floor(Date.now() / 1000)}, {id: user.id});
        this.$cookie.set('user', user.id, {maxAge: 7 * 24 * 3600 * 1000});
    }

    /**
     * 退出
     */
    async logout() {
        this.$cookie.delete('user');
    }

    // 账号上锁
    async inc_lock(id) {
        return await this.db.where({id}).inc('is_lock');
    }

    // 是否锁定
    is_lock(user) {
        return user.is_lock > 0;
    }

    // 加密密码
    passmd5(password, salt) {
        return md5(salt + md5(salt + md5(password + salt) + salt));
    }

    // 生成随机字符
    randomString(len) {
        len = len || 32;
        var $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var maxPos = $chars.length;
        var pwd = '';
        for (let i = 0; i < len; i++) {
            pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
        }
        return pwd;
    }
}

module.exports = User;
