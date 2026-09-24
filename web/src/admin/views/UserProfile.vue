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
