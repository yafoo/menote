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
        <div id="graph-network" class="graph-network-box"></div>
        <div class="graph-info">
            共 <strong>{{ nodesData.length }}</strong> 个笔记节点，<strong>{{ edgesData.length }}</strong> 条双向链接。单击拖动布局，双击节点打开笔记。
        </div>
    </div>
</div>
</template>

<script setup>
import { DataSet, Network } from 'vis-network/standalone';
import { ElMessage } from 'element-plus';
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { request } from '@/admin/api/index.js';
import { store } from '@/admin/store/index.js';

const loading = ref(true);
const nodesData = ref([]);
const edgesData = ref([]);
let network = null;

const render = () => {
    if(!document.getElementById('graph-network')) return;
    const nodes = new DataSet(nodesData.value.map(n => ({
        id: n.id,
        label: n.title || '无标题',
        title: n.title || '无标题',
        color: {
            background: '#409eff',
            border: '#337ecc',
            highlight: {background: '#66b1ff', border: '#409eff'}
        },
        font: {size: 13, color: '#333'},
        shape: 'dot',
        size: 16
    })));
    const edges = new DataSet(edgesData.value.map(e => ({
        from: e.from,
        to: e.to,
        arrows: 'to',
        color: {color: '#c0c4cc', highlight: '#409eff'}
    })));
    if(network) { network.destroy(); network = null; }
    network = new Network(document.getElementById('graph-network'), {nodes, edges}, {
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -3000,
                centralGravity: 0.3,
                springLength: 150,
                springConstant: 0.04,
                damping: 0.09
            }
        },
        interaction: {hover: true, tooltipDelay: 200},
        edges: {width: 1, smooth: {type: 'continuous'}}
    });
    network.on('doubleClick', params => {
        if(params.nodes.length > 0) {
            // admin 内打开笔记：写入 store 缓存并切回工作区
            store.openNote(params.nodes[0]);
        }
    });
};

const refresh = async () => {
    loading.value = true;
    try {
        const res = await request('/api/graph/data');
        if(res.state === 1) {
            nodesData.value = res.data.nodes || [];
            edgesData.value = res.data.edges || [];
            await nextTick();
            render();
        } else {
            ElMessage.error(res.msg || '加载失败');
        }
    } catch(e) {
        ElMessage.error('加载知识图谱失败');
    } finally {
        loading.value = false;
    }
};

onMounted(refresh);
onUnmounted(() => {
    if(network) network.destroy();
});
</script>
