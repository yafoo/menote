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
                <el-select
                    v-if="item.type === 'select'"
                    v-model="item.value"
                    class="settings-select"
                    @change="onConfigChange(item)"
                >
                    <el-option
                        v-for="opt in selectOptions(item)"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                    />
                </el-select>
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
import { applyTheme, previewTheme, readStoredMode, THEME_LABELS } from '@/shared/theme.js';

const loading = ref(true);
const saving = ref(false);
const configItems = ref([]);

// 枚举型配置项的选项表。
//
// menote_site 只有 key/value 两个可用字段，没地方存"这个 select 有哪些选项"，
// 所以选项写在组件里。新增枚举型配置项时在这里补一条即可——没配的会退化成
// 空下拉，肉眼一看就知道漏了。
const SELECT_OPTIONS = {
    theme: ['auto', 'light', 'dark'].map(v => ({value: v, label: THEME_LABELS[v]}))
};

const selectOptions = (item) => SELECT_OPTIONS[item.key] || [];

// 改完立即预览：主题是"所见即所得"的设置，等点保存再看效果太绕。
// previewTheme 只改当前页面的显示，不动 themeMode、更不写 localStorage——
// 所以不会覆盖管理员自己在本机选的偏好，也不会让侧栏的切换按钮跟着乱跳。
// 保存成功后 applyTheme 才真正把状态对齐到新的站点默认值
const onConfigChange = (item) => {
    if(item.key === 'theme') previewTheme(item.value);
};

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
            // 把预览"落实"下来：本机手动选过主题的不受影响（本机偏好优先），
            // 没选过的就跟上新的站点默认值
            const saved = configItems.value.find(i => i.key === 'theme');
            if(saved) applyTheme(readStoredMode() || saved.value);
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

<!--
  本页私有样式，从 admin.css 搬来（原「站点设置页面」分节，含它那段移动端覆盖）。
  **故意不加 scoped**：类名只被本页用；scoped 会把特异性从 (0,1,0) 抬到 (0,2,0)，
  反而盖掉 admin.css 里给所有页面准备的共享规则（.el-form-item 的紧凑间距等）。
  顺序也保持原样：桌面规则在前，@media 覆盖在后。
-->
<style>
.settings-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color);
}

.settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
}

.settings-form {
    max-width: 600px;
}

.settings-form .el-form-item {
    margin-bottom: 20px;
}

/* 枚举型配置项（主题等）：下拉只有几个选项，不必占满整行 */
.settings-select {
    width: 240px;
}

.form-tips {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
    line-height: 1.6;
}

@media (max-width: 768px) {
    .settings-content {
        padding: 16px 12px;
    }

    .settings-form {
        max-width: none;
    }
}
</style>
