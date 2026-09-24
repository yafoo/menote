<template>
<div class="graph-container">
    <p v-if="loading" class="page-loading">加载中…</p>
    <div v-show="!loading" class="graph-network">
        <!-- 画布本身是前后台共用的组件，配色/主题重绘都在里面 -->
        <GraphCanvas :nodes="nodes" :edges="edges" @node-dblclick="openNote" />
    </div>

    <div class="graph-legend">
        <div class="legend-item">
            <span class="legend-dot node"></span>
            <span>笔记节点</span>
        </div>
        <div class="legend-item">
            <span class="legend-dot edge"></span>
            <span>链接关系</span>
        </div>
    </div>
    <div class="graph-info">
        共 <strong>{{nodes.length}}</strong> 个笔记节点，<strong>{{edges.length}}</strong> 条链接关系。双击节点可跳转到笔记详情。
    </div>
</div>
</template>

<script setup>
import {ref, onMounted} from 'vue';
import {useRouter} from 'vue-router';
import {api} from '@/home/api/index.js';
import {store} from '@/home/store/index.js';
import GraphCanvas from '@/shared/GraphCanvas.vue';

const router = useRouter();

const nodes = ref([]);
const edges = ref([]);
const loading = ref(true);

// 前台走 /api/pub/graph，服务端只返回公开笔记（含私密的边会被过滤掉）。
// 后台的 /api/graph/data 能看到全部笔记，两边数据源不通用
const openNote = (id) => {
    router.push(`/note/${id}.html`);
};

onMounted(async () => {
    store.setTitle('知识图谱');

    const res = await api.graph();
    if(res.state === 1) {
        nodes.value = res.data.nodes || [];
        edges.value = res.data.edges || [];
    }
    loading.value = false;
});
</script>
