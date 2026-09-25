<template>
<div class="token-page">
    <div class="page-header">
        <el-button class="page-header-back" text @click="$router.push('/admin')">
            <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-header-title">API Token 管理</span>
        <div class="page-header-actions">
            <el-button size="small" text @click="showCreateDialog" title="创建 Token">
                <el-icon><Plus /></el-icon>
            </el-button>
        </div>
    </div>
    <div class="token-list v-loading-parent" v-loading="loading">
        <div class="table-scroll-wrapper">
        <el-table :data="tokens" stripe>
            <el-table-column prop="name" label="名称" min-width="100" />
            <el-table-column label="权限" min-width="200">
                <template #default="{ row }">
                    <div class="token-perm-tags">
                        <template v-for="group in permSummary(row)" :key="group.name">
                            <el-tag v-for="perm in group.items" :key="perm" size="small" :type="group.type" class="token-perm-tag">{{ perm }}</el-tag>
                        </template>
                        <el-tag v-if="permSummary(row).length === 0" size="small" type="danger">无权限</el-tag>
                    </div>
                </template>
            </el-table-column>
            <el-table-column prop="token" label="Token" min-width="180">
                <template #default="{ row }">
                    <span class="token-value">{{ maskToken(row.token) }}</span>
                    <el-button size="small" text @click="copyToken(row.token)">
                        <el-icon><CopyDocument /></el-icon>
                    </el-button>
                </template>
            </el-table-column>
            <el-table-column label="过期时间" width="160">
                <template #default="{ row }">
                    <span v-if="row.expire_time === 0">永不过期</span>
                    <span v-else>{{ formatDateTime(row.expire_time) }}</span>
                </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                    <el-button size="small" text @click="showEditDialog(row)">编辑</el-button>
                    <el-button size="small" type="danger" text @click="deleteToken(row)">删除</el-button>
                </template>
            </el-table-column>
        </el-table>
        </div>
        <div v-if="tokens.length === 0 && !loading" class="token-empty">
            暂无 Token，点击上方按钮创建
        </div>
    </div>

    <!-- 创建/编辑 Token 对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑 Token' : '创建 Token'" width="450px">
        <el-form :model="tokenForm" label-width="80px">
            <el-form-item label="名称">
                <el-input v-model="tokenForm.name" placeholder="如：手机端API" />
            </el-form-item>
            <el-form-item label="过期时间">
                <el-select v-model="tokenForm.expire_type" style="width: 100%" :disabled="!!editingId && keepExpire">
                    <el-option label="永不过期" value="0" />
                    <el-option label="30天" value="30" />
                    <el-option label="90天" value="90" />
                    <el-option label="1年" value="365" />
                    <el-option label="自定义" value="custom" />
                </el-select>
                <el-checkbox v-model="keepExpire" v-if="!!editingId" class="keep-expire-check">保持原过期时间不变</el-checkbox>
            </el-form-item>
            <el-form-item v-if="tokenForm.expire_type === 'custom' && !(!!editingId && keepExpire)" label="自定义天数">
                <el-input-number v-model="tokenForm.custom_days" :min="1" :max="3650" />
            </el-form-item>
            <el-form-item label="权限">
                <div class="perm-groups">
                    <div v-for="group in TOKEN_PERM_GROUPS" :key="group.name" class="perm-group">
                        <div class="perm-group-header">
                            <span>{{ group.name }}</span>
                            <el-checkbox v-model="groupAll[group.name]" @change="toggleGroup(group)" class="perm-group-all">全选</el-checkbox>
                        </div>
                        <el-checkbox-group v-model="tokenForm.permissions_arr" class="perm-group-items">
                            <el-checkbox v-for="item in group.items" :key="item.key" :value="item.key">{{ item.label }}</el-checkbox>
                        </el-checkbox-group>
                    </div>
                </div>
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" @click="submitToken" :loading="creating">{{ editingId ? '保存' : '创建' }}</el-button>
        </template>
    </el-dialog>
</div>
</template>

<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { ref, reactive, onMounted, watch } from 'vue';
import { request } from '@/admin/api/index.js';
import { TOKEN_PERM_GROUPS } from '@/admin/permissions.js';
import { formatDateTime } from '@/admin/utils/index.js';

const loading = ref(true);
const creating = ref(false);
const dialogVisible = ref(false);
const tokens = ref([]);
const editingId = ref(null);
const keepExpire = ref(true);

const tokenForm = reactive({
    name: '',
    expire_type: '0',
    custom_days: 30,
    permissions_arr: []
});

// 分组全选状态
const groupAll = reactive({});

const loadTokens = async () => {
    loading.value = true;
    try {
        const res = await request('/api/token/list');
        if(res.state === 1) {
            tokens.value = res.data;
        }
    } catch(e) {
        ElMessage.error('加载 Token 失败');
    } finally {
        loading.value = false;
    }
};

// 列表权限摘要：[{name, type, items:['查看','新增']}]
const permSummary = (row) => {
    const result = [];
    TOKEN_PERM_GROUPS.forEach(group => {
        const items = [];
        group.items.forEach(item => {
            if(row.permissions_arr && row.permissions_arr.includes(item.key)) {
                items.push(item.label);
            } else if(row.perm_groups) {
                // 后端返回的勾选态
                const g = row.perm_groups.find(pg => pg.name === group.name);
                const it = g && g.items.find(i => i.key === item.key);
                if(it && it.checked) items.push(item.label);
            }
        });
        if(items.length) {
            result.push({name: group.name, type: group.name === '分类管理' ? 'primary' : 'success', items});
        }
    });
    return result;
};

const refreshGroupAll = () => {
    TOKEN_PERM_GROUPS.forEach(group => {
        groupAll[group.name] = group.items.every(item => tokenForm.permissions_arr.includes(item.key));
    });
};

const toggleGroup = (group) => {
    if(groupAll[group.name]) {
        // 全选：加上缺失项
        group.items.forEach(item => {
            if(!tokenForm.permissions_arr.includes(item.key)) {
                tokenForm.permissions_arr.push(item.key);
            }
        });
    } else {
        // 取消全选：移除该组全部
        const groupKeys = group.items.map(item => item.key);
        tokenForm.permissions_arr = tokenForm.permissions_arr.filter(k => !groupKeys.includes(k));
    }
};

// 监听权限勾选变化，同步全选框
watch(() => tokenForm.permissions_arr, refreshGroupAll, {deep: true});

const showCreateDialog = () => {
    editingId.value = null;
    keepExpire.value = true;
    tokenForm.name = '';
    tokenForm.expire_type = '0';
    tokenForm.custom_days = 30;
    tokenForm.permissions_arr = [];
    refreshGroupAll();
    dialogVisible.value = true;
};

const showEditDialog = (row) => {
    editingId.value = row.id;
    keepExpire.value = true;
    tokenForm.name = row.name;

    // 过期时间回显：0=永不过期，否则算剩余天数
    if(row.expire_time === 0) {
        tokenForm.expire_type = '0';
    } else {
        const remainDays = Math.ceil((row.expire_time * 1000 - Date.now()) / 86400000);
        tokenForm.expire_type = remainDays > 0 ? String(remainDays) : '0';
    }
    tokenForm.custom_days = 30;

    // 权限回显：优先后端 perm_groups 勾选态
    tokenForm.permissions_arr = [];
    if(row.perm_groups) {
        row.perm_groups.forEach(g => g.items.forEach(item => {
            if(item.checked) tokenForm.permissions_arr.push(item.key);
        }));
    }
    refreshGroupAll();
    dialogVisible.value = true;
};

const submitToken = async () => {
    if(!tokenForm.name) {
        ElMessage.warning('请输入名称');
        return;
    }
    if(tokenForm.permissions_arr.length === 0) {
        ElMessage.warning('请至少勾选一项权限');
        return;
    }

    creating.value = true;
    try {
        // 过期时间计算：编辑+保持原值 → 传 -1 让后端不动（后端按 0 处理会覆盖！改为不传字段由后端保留）
        let expire_time;
        if(editingId.value && keepExpire.value) {
            expire_time = undefined; // 不更新过期时间
        } else if(tokenForm.expire_type === 'custom') {
            expire_time = Math.floor(Date.now() / 1000) + tokenForm.custom_days * 86400;
        } else if(tokenForm.expire_type !== '0') {
            expire_time = Math.floor(Date.now() / 1000) + parseInt(tokenForm.expire_type) * 86400;
        } else {
            expire_time = 0;
        }

        const body = {
            name: tokenForm.name,
            permissions_arr: [...tokenForm.permissions_arr]
        };
        if(editingId.value) body.id = editingId.value;
        if(expire_time !== undefined) body.expire_time = expire_time;

        const res = await request(editingId.value ? '/api/token/edit' : '/api/token/create', {
            method: 'POST',
            body
        });

        if(res.state === 1) {
            ElMessage.success(editingId.value ? '保存成功' : '创建成功');
            dialogVisible.value = false;
            loadTokens();
        } else {
            ElMessage.error(res.msg || '操作失败');
        }
    } catch(e) {
        ElMessage.error('操作失败');
    } finally {
        creating.value = false;
    }
};

const deleteToken = async (token) => {
    try {
        await ElMessageBox.confirm(
            `确定删除 Token「${token.name}」吗？删除后使用此 Token 的客户端将无法访问。`,
            '删除确认',
            { type: 'warning' }
        );

        const res = await request(`/api/token/delete?id=${token.id}`);
        if(res.state === 1) {
            ElMessage.success('删除成功');
            loadTokens();
        } else {
            ElMessage.error(res.msg || '删除失败');
        }
    } catch(e) {
        // 用户取消
    }
};

const maskToken = (token) => {
    if(!token || token.length < 16) return token;
    return token.substring(0, 8) + '...' + token.substring(token.length - 8);
};

const copyToken = (token) => {
    navigator.clipboard.writeText(token).then(() => {
        ElMessage.success('已复制到剪贴板');
    }).catch(() => {
        ElMessage.error('复制失败');
    });
};

onMounted(() => {
    loadTokens();
});
</script>

<!--
  本页私有样式，从 admin.css 搬来（原「Token 管理页面」分节，含它那段移动端覆盖）。
  **故意不加 scoped**：见 SiteSettings.vue 里同样的说明（抬特异性会盖掉共享规则）。
  顺序保持原样：桌面规则在前，@media 覆盖在后。
-->
<style>
.token-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color);
}

.token-list {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
}

.token-empty {
    text-align: center;
    padding: 60px 0;
    color: var(--el-text-color-secondary);
    font-size: 14px;
}

.token-value {
    font-family: monospace;
    font-size: 12px;
    color: var(--el-text-color-regular);
    margin-right: 8px;
}

/* Token 权限标签 */
.token-perm-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
}

.token-perm-tag {
    margin-right: 2px;
}

/* Token 弹窗权限分组勾选 */
.perm-groups {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.perm-group {
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 4px;
    padding: 8px 10px;
}

.perm-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--el-text-color-regular);
    font-weight: 500;
}

.perm-group-all {
    height: auto;
    font-size: 12px;
    font-weight: 400;
}

.perm-group-items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
}

.perm-group-items .el-checkbox {
    margin-right: 0;
}

.keep-expire-check {
    height: auto;
    margin-top: 6px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
    .token-list {
        padding: 16px 12px;
    }
}
</style>
