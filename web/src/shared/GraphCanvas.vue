<!--
    知识图谱画布 —— 前台 / 后台共用。

    只负责"画"这一层：vis-network 的 DataSet / Network、配色、主题切换重绘、
    生命周期。数据从哪来、双击之后去哪，都交给调用方：

      · 前台  /api/pub/graph   服务端只返回公开笔记（四个 INNER JOIN 卡住 is_public=1，
                               防止把「私密 ↔ 私密」的边泄露给匿名访问者），双击跳笔记详情
      · 后台  /api/graph/data  返回全部笔记（含私密草稿），双击交给 store.openNote

    两个接口的可见范围不同，不能合并——所以共用的是画布，不是数据。

    vis-network 约 615KB，按需 import，只有进图谱页才加载。
-->
<template>
    <div ref="el" class="graph-canvas"></div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { resolvedTheme } from './theme.js';

const props = defineProps({
    // [{ id, title }]
    nodes: { type: Array, default: () => [] },
    // [{ from, to }]
    edges: { type: Array, default: () => [] },
    // 节点直径 / 描边宽度
    nodeSize: { type: Number, default: 22 },
    nodeBorderWidth: { type: Number, default: 1.5 }
});

const emit = defineEmits(['node-dblclick']);

const el = ref(null);
let network = null;
let nodeSet = null;
let edgeSet = null;
let disposed = false;

// canvas 里读不到 CSS 变量，只能运行时从 <html> 上算出来。
// 前台这些令牌定义在 home.css；后台没有同名令牌，是在 admin.css 里用 var()
// 别名指到 --el-color-primary 系列上的，所以同一份读取逻辑两边都能跑。
const cssVar = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
};

const readPalette = () => {
    const dark = resolvedTheme.value === 'dark';
    return {
        fill: cssVar('--accent', dark ? '#76ccb5' : '#00796b'),
        // hover / 选中态：浅色下压深、暗色下提亮，都由 --accent-deep 表达
        fillActive: cssVar('--accent-deep', dark ? '#9cf2db' : '#00594e'),
        // ⚠️ vis-network 把节点 label 画在节点**下方**，也就是画布底色上，
        // 不是节点填充色上。所以字号颜色要对的是 --text，不是 --accent-on——
        // 早先误用 --accent-on，结果浅色下白字压浅画布、暗色下黑字压暗画布，
        // 两边都看不见（截图核对时才发现）
        labelOnCanvas: cssVar('--text', dark ? '#e7efed' : '#1b2a27'),
        edge: cssVar('--border', dark ? '#263430' : '#dbe7e3'),
        edgeActive: cssVar('--accent', dark ? '#76ccb5' : '#00796b'),
        face: cssVar('--font-ui', 'sans-serif'),
        shadow: dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(16, 48, 42, 0.14)'
    };
};

const nodeStyle = (p) => ({
    color: {
        background: p.fill,
        border: p.fillActive,
        highlight: { background: p.fillActive, border: p.fillActive },
        hover: { background: p.fillActive, border: p.fillActive }
    },
    font: { size: 14, color: p.labelOnCanvas, face: p.face },
    shadow: { enabled: true, color: p.shadow, size: 8, x: 0, y: 2 }
});

const edgeStyle = (p) => ({
    arrows: { to: { scaleFactor: 0.6 } },
    color: { color: p.edge, highlight: p.edgeActive, hover: p.edgeActive },
    width: 1.2
});

// 切主题时不重建 Network——那会把物理布局的落点也重置掉，整张图会"跳"一下。
// 只把颜色逐项 update 进去即可
const repaint = () => {
    if(!network || !nodeSet || !edgeSet) return;
    const p = readPalette();
    nodeSet.update(props.nodes.map(n => ({ id: n.id, ...nodeStyle(p) })));
    edgeSet.update(props.edges.map(e => ({ from: e.from, to: e.to, ...edgeStyle(p) })));
};

const destroy = () => {
    if(network) {
        network.destroy();
        network = null;
    }
    nodeSet = null;
    edgeSet = null;
};

const build = async () => {
    destroy();
    if(!props.nodes.length && !props.edges.length) return;

    // 调用方常把 loading 开关和 nodes 一起赋值，此时画布容器还是 display:none。
    // 等一次 nextTick 让 DOM 更新落地，容器才有真实尺寸——否则 vis-network
    // 会在 0×0 的画布上算布局
    await nextTick();
    if(disposed || !el.value) return;

    const { DataSet, Network } = await import('vis-network/standalone');
    if(disposed || !el.value) return;

    const p = readPalette();

    nodeSet = new DataSet(props.nodes.map(n => ({
        id: n.id,
        label: n.title || '无标题',
        title: n.title || '无标题',
        ...nodeStyle(p),
        shape: 'dot',
        size: props.nodeSize,
        borderWidth: props.nodeBorderWidth
    })));

    edgeSet = new DataSet(props.edges.map(e => ({
        from: e.from,
        to: e.to,
        ...edgeStyle(p)
    })));

    network = new Network(el.value, { nodes: nodeSet, edges: edgeSet }, {
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
        interaction: { hover: true, tooltipDelay: 200 },
        edges: { width: 1, smooth: { type: 'continuous' } }
    });

    network.on('doubleClick', (params) => {
        if(params.nodes.length > 0) emit('node-dblclick', params.nodes[0]);
    });
};

onMounted(build);
// 两个 getter 分开写：nodes/edges 是整体替换（不是原地 push），比引用即可
watch([() => props.nodes, () => props.edges], build);
watch(resolvedTheme, repaint);
onUnmounted(() => {
    disposed = true;
    destroy();
});
</script>

<style scoped>
/* 尺寸交给外层容器（前台 .graph-network 定高 560px，后台 .graph-network-box 用 flex:1 撑满） */
.graph-canvas {
    width: 100%;
    height: 100%;
}
</style>
