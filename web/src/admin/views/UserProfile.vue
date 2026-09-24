<template>
<div class="profile-page">
    <div class="page-header">
        <el-button class="page-header-back" text @click="$router.push('/admin')">
            <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-header-title">账户信息</span>
        <div class="page-header-actions"></div>
    </div>
    <div class="profile-content" v-loading="loading">
        <el-form :model="userForm" label-width="90px" class="profile-form">
            <el-form-item label="用户名">
                <el-input v-model="userForm.username" placeholder="用户名" />
            </el-form-item>
            <el-form-item label="新密码">
                <el-input v-model="userForm.password" type="password" placeholder="留空则不修改" show-password />
            </el-form-item>
            <el-form-item label="确认密码">
                <el-input v-model="userForm.confirmPassword" type="password" placeholder="再次输入新密码" show-password />
            </el-form-item>
            <el-form-item>
                <el-button type="primary" @click="saveUser" :loading="saving">保存修改</el-button>
            </el-form-item>
        </el-form>
    </div>
</div>
</template>

<script setup>
import { ElMessage } from 'element-plus';
import { ref, reactive, onMounted } from 'vue';
import { request } from '@/admin/api/index.js';
import { store } from '@/admin/store/index.js';

const loading = ref(true);
const saving = ref(false);
const userForm = reactive({
    username: '',
    password: '',
    confirmPassword: ''
});

onMounted(async () => {
    try {
        const data = await request('/api/user/info');
        if(data.state === 1) {
            userForm.username = data.data.username || '';
        }
    } catch(e) {
        console.error('加载用户信息失败', e);
    } finally {
        loading.value = false;
    }
});

const saveUser = async () => {
    if(!userForm.username) {
        ElMessage.warning('用户名不能为空');
        return;
    }

    if(userForm.password && userForm.password !== userForm.confirmPassword) {
        ElMessage.warning('两次输入的密码不一致');
        return;
    }

    saving.value = true;
    try {
        const res = await request('/api/user/edit', {
            method: 'POST',
            body: {
                username: userForm.username,
                password: userForm.password || undefined
            }
        });

        if(res.state === 1) {
            ElMessage.success('保存成功');
            store.username = userForm.username;
        } else {
            ElMessage.error(res.msg || '保存失败');
        }
    } catch(e) {
        ElMessage.error('保存失败');
    } finally {
        saving.value = false;
    }
};
</script>

<!--
  本页私有样式，从 admin.css 搬来（原「账户信息页面」分节，含它那段移动端覆盖）。
  **故意不加 scoped**：见 SiteSettings.vue 里同样的说明（抬特异性会盖掉共享规则）。
  顺序保持原样：桌面规则在前，@media 覆盖在后。
-->
<style>
.profile-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color);
}

.profile-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
}

.profile-form {
    max-width: 480px;
}

.profile-form .el-form-item {
    margin-bottom: 20px;
}

@media (max-width: 768px) {
    .profile-content {
        padding: 16px 12px;
    }

    .profile-form {
        max-width: none;
    }
}
</style>
