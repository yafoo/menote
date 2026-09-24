<template>
<div class="graph-page">
    <div class="page-header">
        <el-button class="page-header-back" text @click="$router.push('/admin')">
            <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-header-title">知识图谱</span>
        <div class="page-header-actions">
            <el-button size="small" text @click="refresh" title="重新加载">
                <el-icon><Refresh /></el-icon>
            </el-button>
        </div>
    </div>
    <div class="graph-content" v-loading="loading">
        <!-- 画布本身是前后台共用的组件，配色/主题重绘都在里面 -->
        <div class="graph-network-box">
            <GraphCanvas :nodes="nodesData" :edges="edgesData" @node-dblclick="openNote" />
        </div>
        <div class="graph-info">
            共 <strong>{{ nodesData.length }}</strong> 个笔记节点，<strong>{{ edgesData.length }}</strong> 条双向链接。单击拖动布局，双击节点打开笔记。
        </div>
    </div>
</div>
</template>

<script setup>
import { ElMessage } from 'element-plus';
import { ref, onMounted } from 'vue';
import { request } from '@/admin/api/index.js';
import { store } from '@/admin/store/index.js';
import GraphCanvas from '@/shared/GraphCanvas.vue';

const loading = ref(true);
const nodesData = ref([]);
const edgesData = ref([]);

// 后台走 /api/graph/data，返回全部笔记（含私密草稿）。
// 前台的 /api/pub/graph 是匿名接口，只吐公开笔记，后台不能拿它当数据源
const refresh = async () => {
    loading.value = true;
    try {
        const res = await request('/api/graph/data');
        if(res.state === 1) {
            nodesData.value = res.data.nodes || [];
            edgesData.value = res.data.edges || [];
        } else {
            ElMessage.error(res.msg || '加载失败');
        }
    } catch(e) {
        ElMessage.error('加载知识图谱失败');
    } finally {
        loading.value = false;
    }
};

// 双击节点：写入 store 缓存并切回工作区
const openNote = (id) => {
    store.openNote(id);
};

onMounted(refresh);
</script>
