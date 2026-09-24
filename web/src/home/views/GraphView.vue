<template>
<div class="graph-container">
    <p v-if="loading" class="page-loading">加载中…</p>
    <div v-show="!loading" ref="networkEl" class="graph-network"></div>

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
import {ref, onMounted, onUnmounted, nextTick} from 'vue';
import {useRouter} from 'vue-router';
import {api} from '@/home/api/index.js';
import {store} from '@/home/store/index.js';

const router = useRouter();

const networkEl = ref(null);
const nodes = ref([]);
const edges = ref([]);
const loading = ref(true);

let network = null;

onMounted(async () => {
    store.setTitle('知识图谱');

    const res = await api.graph();
    if(res.state === 1) {
        nodes.value = res.data.nodes || [];
        edges.value = res.data.edges || [];
    }
    loading.value = false;
    await nextTick();

    // vis-network 约 615KB，按需加载——只有这个页面需要
    const {DataSet, Network} = await import('vis-network/standalone');

    const nodeSet = new DataSet(nodes.value.map(n => ({
        id: n.id,
        label: n.title || '无标题笔记',
        title: n.title,
        // 配色跟 public.css 的 --accent / --text 对齐（canvas 里读不到 CSS 变量，只能写死）
        color: {
            background: '#b96a42',
            border: '#9c5433',
            highlight: {background: '#cf8259', border: '#b96a42'},
            hover: {background: '#cf8259', border: '#b96a42'}
        },
        font: {size: 14, color: '#3d3733', face: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'},
        shape: 'dot',
        size: 22,
        borderWidth: 1.5,
        shadow: {enabled: true, color: 'rgba(93, 72, 52, 0.16)', size: 8, x: 0, y: 2}
    })));

    const edgeSet = new DataSet(edges.value.map(e => ({
        from: e.from,
        to: e.to,
        arrows: {to: {scaleFactor: 0.6}},
        color: {color: '#ded4c8', highlight: '#b96a42', hover: '#b96a42'},
        width: 1.2
    })));

    network = new Network(networkEl.value, {nodes: nodeSet, edges: edgeSet}, {
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

    // 旧版是双击跳转（window.location.href），这里改成路由跳转，不再整页刷新
    network.on('doubleClick', (params) => {
        if(params.nodes.length > 0) {
            router.push(`/note/${params.nodes[0]}.html`);
        }
    });
});

onUnmounted(() => {
    if(network) {
        network.destroy();
        network = null;
    }
});
</script>
