<template>
<div class="p2p-page">
    <div class="page-header">
        <el-button class="page-header-back" text @click="$router.push('/admin')">
            <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-header-title">P2P 管理</span>
        <div class="page-header-actions">
            <el-button size="small" text @click="showIdDialog" title="本节点 ID 与二维码">
                <el-icon class="p2p-icon-qr"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3zm2 2v3h3V5H5zM14 3h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zM14 14h3v3h-3v-3zM18 14h3v3h-3v-3zM14 18h3v3h-3v-3zM18 18h3v3h-3v-3z"/></svg></el-icon>
            </el-button>
        </div>
    </div>

    <div class="p2p-content v-loading-parent" v-loading="loading">
        <!-- 本节点 ID -->
        <div class="p2p-section-title">本节点 ID（手机端填这个，或扫二维码）</div>
        <div class="p2p-node-card">
            <div class="p2p-node-id-row" v-if="status.nodeId">
                <span class="p2p-node-id-main">{{ shortNodeId }}</span>
                <span class="p2p-node-id-toggle" @click="idExpanded = !idExpanded" title="点击展开/收起完整 ID">
                    {{ idExpanded ? '收起 ▲' : '完整 ID ▼' }}
                </span>
            </div>
            <div class="p2p-node-id" v-if="status.nodeId && idExpanded" style="margin-top: 4px">{{ status.nodeId }}</div>
            <div class="p2p-node-id" :class="{offline: !status.running}" v-if="!status.nodeId">P2P 服务未启动</div>
            <div class="p2p-node-id-actions" v-if="status.nodeId">
                <el-button size="small" @click="copyNodeId" title="复制完整 ID">
                    <el-icon><CopyDocument /></el-icon> 复制
                </el-button>
                <el-button size="small" @click="showIdDialog" title="显示二维码">
                    <el-icon class="p2p-icon-qr"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3zm2 2v3h3V5H5zM14 3h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zM14 14h3v3h-3v-3zM18 14h3v3h-3v-3zM14 18h3v3h-3v-3zM18 18h3v3h-3v-3z"/></svg></el-icon> 二维码
                </el-button>
            </div>
        </div>

        <!-- 待授权配对请求 -->
        <div v-if="status.pending && status.pending.length" class="p2p-pending-section">
            <div class="p2p-section-title">
                待授权配对请求
                <el-badge :value="status.pending.length" type="warning" />
            </div>
            <div v-for="p in status.pending" :key="p.id" class="p2p-pending-item">
                <div class="p2p-pending-info">
                    <span class="p2p-pending-id">{{ p.id }}</span>
                    <span class="p2p-pending-time">{{ formatTime(p.time) }} 尝试 {{ p.attempts }} 次</span>
                </div>
                <div class="p2p-pending-actions">
                    <el-button size="small" type="primary" @click="authorize(p)">授权</el-button>
                    <el-button size="small" @click="dismiss(p)">忽略</el-button>
                </div>
            </div>
        </div>

        <!-- 白名单 -->
        <div class="p2p-section-title">已配对设备（白名单）</div>
        <div class="table-scroll-wrapper">
        <el-table :data="status.peers" stripe>
            <el-table-column prop="name" label="名称" min-width="100">
                <template #default="{ row }">
                    <span v-if="row.name">{{ row.name }}</span>
                    <span v-else class="p2p-unnamed">未命名</span>
                </template>
            </el-table-column>
            <el-table-column prop="id" label="节点 ID" min-width="140">
                <template #default="{ row }">
                    <el-tooltip :content="row.id + '（点击复制）'" placement="top" :show-after="300">
                        <span class="p2p-peer-id p2p-peer-id-copy" @click="copyText(row.id, '已复制节点 ID')">{{ row.id.substring(0, 10) }}…</span>
                    </el-tooltip>
                </template>
            </el-table-column>
            <el-table-column label="状态" width="150">
                <template #default="{ row }">
                    <template v-if="row.online">
                        <el-tag type="success" size="small">在线</el-tag>
                        <el-tooltip :content="row.remoteAddr || ''" placement="top" :show-after="300">
                            <el-tag :type="row.path === 'p2p' ? 'primary' : 'warning'" size="small" style="margin-left: 4px">
                                {{ row.path === 'p2p' ? 'P2P' : '中继' }}
                            </el-tag>
                        </el-tooltip>
                    </template>
                    <el-tag v-else type="info" size="small">离线</el-tag>
                </template>
            </el-table-column>
            <el-table-column label="配对时间" width="150">
                <template #default="{ row }">
                    <span>{{ formatTime(row.time) }}</span>
                </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
                <template #default="{ row }">
                    <el-button size="small" type="danger" plain @click="removePeer(row)">移除</el-button>
                </template>
            </el-table-column>
        </el-table>
        </div>
        <div v-if="status.peers && status.peers.length === 0 && !loading" class="p2p-empty">
            暂无配对设备。手机端 App 填入本节点 ID 并连接后，会在这里出现配对请求。
        </div>

        <!-- 手动添加 -->
        <div class="p2p-manual-add">
            <div class="p2p-section-title">手动添加</div>
            <div class="p2p-manual-row">
                <el-input v-model="manualName" placeholder="名称（如：我的手机）" size="default" class="p2p-manual-name" clearable />
                <el-input v-model="manualId" placeholder="手机节点 ID（App 里显示/扫码获得）" size="default" class="p2p-manual-id" clearable />
                <el-button type="primary" @click="addManual" :disabled="!manualId" class="p2p-manual-btn">添加</el-button>
            </div>
        </div>
    </div>

    <!-- 节点 ID 二维码弹窗（手机扫码用） -->
    <el-dialog v-model="idDialogVisible" title="本节点 ID" width="360px" class="p2p-qrcode-dialog">
        <div class="p2p-qrcode-body" v-loading="qrcodeLoading">
            <img v-if="qrcodeData" :src="qrcodeData" class="p2p-qrcode-img" alt="节点 ID 二维码" />
            <div class="p2p-qrcode-id" v-if="status.nodeId">{{ status.nodeId }}</div>
            <div class="p2p-qrcode-tip">手机端 App 扫此码即可填入节点 ID</div>
        </div>
    </el-dialog>

    <!-- 授权确认弹窗（新配对请求） -->
    <el-dialog v-model="authorizeDialogVisible" title="P2P 配对请求" width="420px">
        <div class="p2p-authorize-body">
            <p>检测到新设备连接：</p>
            <div class="p2p-authorize-id">{{ authorizeTarget ? authorizeTarget.id : '' }}</div>
            <p class="p2p-authorize-tip">请确认这是你自己的设备（ID 来自加密握手，不可伪造）。</p>
            <el-input v-model="authorizeName" placeholder="设备名称（如：我的手机，可留空）" style="margin-top: 12px" />
        </div>
        <template #footer>
            <el-button @click="dismissAuthorize">拒绝</el-button>
            <el-button type="primary" @click="confirmAuthorize">授权</el-button>
        </template>
    </el-dialog>
</div>
</template>

<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { request } from '@/admin/api/index.js';

const loading = ref(true);
const status = ref({running: false, nodeId: '', peers: [], pending: [], online: []});
const idDialogVisible = ref(false);
const qrcodeData = ref('');
const qrcodeLoading = ref(false);
const authorizeDialogVisible = ref(false);
const authorizeTarget = ref(null);
const authorizeName = ref('');
const manualId = ref('');
const manualName = ref('');
const idExpanded = ref(false);
const shortNodeId = computed(() => (status.value.nodeId || '').substring(0, 10));

let pollTimer = null;
// 已弹窗提醒过的配对请求（避免轮询期间重复弹）
const notifiedPairings = new Set();

const loadStatus = async () => {
    try {
        const res = await request('/api/p2p/status');
        if(res.state === 1) {
            const prevPendingIds = new Set(status.value.pending.map(p => p.id));
            status.value = res.data;
            // 新配对请求到达 → 自动弹授权窗
            res.data.pending.forEach(p => {
                if(!prevPendingIds.has(p.id) && !notifiedPairings.has(p.id)) {
                    notifiedPairings.add(p.id);
                    authorizeTarget.value = p;
                    authorizeName.value = '';
                    authorizeDialogVisible.value = true;
                }
            });
        }
    } catch(e) { /* 轮询失败静默 */ }
};

const startPoll = () => {
    pollTimer = setInterval(loadStatus, 3000);
};
const stopPoll = () => {
    if(pollTimer) { clearInterval(pollTimer); pollTimer = null; }
};

/** 通用复制：成功/失败提示可定制 */
const copyText = (text, okMsg = '已复制到剪贴板') => {
    if(!text) return;
    navigator.clipboard.writeText(text).then(() => {
        ElMessage.success(okMsg);
    }).catch(() => {
        ElMessage.error('复制失败');
    });
};

const copyNodeId = () => copyText(status.value.nodeId);

const showIdDialog = async () => {
    idDialogVisible.value = true;
    if(!qrcodeData.value) {
        qrcodeLoading.value = true;
        try {
            const res = await request('/api/p2p/qrcode');
            if(res.state === 1) {
                qrcodeData.value = res.data.qrcode;
            } else {
                ElMessage.error(res.msg || '生成二维码失败');
            }
        } catch(e) {
            ElMessage.error('生成二维码失败');
        } finally {
            qrcodeLoading.value = false;
        }
    }
};

// 列表上的「授权」按钮（与弹窗共用逻辑）
const authorize = (p) => {
    authorizeTarget.value = p;
    authorizeName.value = p.name || '';
    authorizeDialogVisible.value = true;
};

const confirmAuthorize = async () => {
    if(!authorizeTarget.value) return;
    try {
        const res = await request('/api/p2p/authorize', {
            method: 'POST',
            body: { id: authorizeTarget.value.id, name: authorizeName.value }
        });
        if(res.state === 1) {
            ElMessage.success(res.msg || '已授权');
            notifiedPairings.delete(authorizeTarget.value.id);
            authorizeDialogVisible.value = false;
            authorizeTarget.value = null;
            loadStatus();
        } else {
            ElMessage.error(res.msg || '操作失败');
        }
    } catch(e) {
        ElMessage.error('操作失败');
    }
};

const dismissAuthorize = async () => {
    if(authorizeTarget.value) {
        try {
            await request('/api/p2p/dismiss', { method: 'POST', body: { id: authorizeTarget.value.id } });
        } catch(e) { /* 忽略 */ }
        notifiedPairings.delete(authorizeTarget.value.id);
    }
    authorizeDialogVisible.value = false;
    authorizeTarget.value = null;
    loadStatus();
};

const dismiss = async (p) => {
    try {
        const res = await request('/api/p2p/dismiss', { method: 'POST', body: { id: p.id } });
        if(res.state === 1) {
            notifiedPairings.delete(p.id);
            ElMessage.success('已忽略');
            loadStatus();
        }
    } catch(e) { /* 忽略 */ }
};

const addManual = async () => {
    if(!manualId.value.trim()) return;
    try {
        const res = await request('/api/p2p/add', {
            method: 'POST',
            body: { id: manualId.value.trim(), name: manualName.value.trim() }
        });
        if(res.state === 1) {
            ElMessage.success(res.msg || '已添加');
            manualId.value = '';
            manualName.value = '';
            loadStatus();
        } else {
            ElMessage.error(res.msg || '添加失败');
        }
    } catch(e) {
        ElMessage.error('操作失败');
    }
};

const removePeer = async (peer) => {
    try {
        await ElMessageBox.confirm(
            `确定移除设备「${peer.name || peer.id.substring(0, 16) + '…'}」吗？移除后该设备将无法连接。`,
            '移除确认',
            { type: 'warning' }
        );
        const res = await request('/api/p2p/remove', { method: 'POST', body: { id: peer.id } });
        if(res.state === 1) {
            ElMessage.success('已移除');
            loadStatus();
        } else {
            ElMessage.error(res.msg || '移除失败');
        }
    } catch(e) { /* 用户取消 */ }
};

const formatTime = (timestamp) => {
    if(!timestamp) return '';
    const d = new Date(timestamp * 1000);
    return d.toLocaleString('zh-CN');
};

onMounted(() => {
    loadStatus().then(() => { loading.value = false; });
    startPoll();
});

onUnmounted(() => {
    stopPoll();
});
</script>
