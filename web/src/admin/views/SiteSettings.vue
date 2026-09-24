<template>
<div class="settings-page">
    <div class="page-header">
        <el-button class="page-header-back" text @click="$router.push('/admin')">
            <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-header-title">站点设置</span>
        <div class="page-header-actions"></div>
    </div>
    <div class="settings-content" v-loading="loading">
        <el-form label-width="90px" class="settings-form">
            <el-form-item v-for="item in configItems" :key="item.key" :label="item.title">
                <el-input v-if="item.type === 'input'" v-model="item.value" />
                <el-input v-else-if="item.type === 'textarea'" v-model="item.value" type="textarea" :rows="3" />
                <el-input v-else v-model="item.value" />
                <div v-if="item.tips" class="form-tips">{{item.tips}}</div>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" @click="saveSettings" :loading="saving">保存设置</el-button>
            </el-form-item>
        </el-form>
    </div>
</div>
</template>

<script setup>
import { ElMessage } from 'element-plus';
import { ref, onMounted } from 'vue';
import { request } from '@/admin/api/index.js';

const loading = ref(true);
const saving = ref(false);
const configItems = ref([]);

const loadConfig = async () => {
    loading.value = true;
    try {
        const res = await request('/api/site/get');
        if(res.state === 1) {
            configItems.value = res.data;
        }
    } catch(e) {
        ElMessage.error('加载配置失败');
    } finally {
        loading.value = false;
    }
};

const saveSettings = async () => {
    saving.value = true;
    try {
        const items = configItems.value.map(item => ({
            key: item.key,
            value: item.value
        }));
        const res = await request('/api/site/save', {
            method: 'POST',
            body: { items }
        });
        if(res.state === 1) {
            ElMessage.success('保存成功');
        } else {
            ElMessage.error(res.msg || '保存失败');
        }
    } catch(e) {
        ElMessage.error('保存失败');
    } finally {
        saving.value = false;
    }
};

onMounted(() => {
    loadConfig();
});
</script>
