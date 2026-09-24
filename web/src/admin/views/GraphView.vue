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

// 双击节点：把笔记装进 store 的 Tab 里。
// ⚠️ 注意它**不会切换路由**——openNote 只加 Tab，enterEditor 又只在移动端
// 改 mobileView，所以桌面端双击后页面仍停在图谱页，看不到笔记。
// 这是已知问题（修法：这里 await 之后 router.push('/admin')，但要先确认
// 不会打乱移动端 enterEditor 的 pushState/popstate 配对），本次未动。
const openNote = (id) => {
    store.openNote(id);
};

onMounted(refresh);
</script>

<!--
  本页私有样式，从 admin.css 搬来（原「知识图谱页面」分节）。
  **故意不加 scoped**：
    1. 类名只被这一个页面用，不存在外泄；
    2. scoped 会把 .graph-page 编译成 .graph-page[data-v-x]，特异性从 (0,1,0) 抬到
       (0,2,0)，admin.css 里针对同一元素的共享覆盖（.el-container 之类）就挤不过它了；
    3. 非 scoped 的样式随本页 chunk 懒加载，与 admin.css 的先后顺序不影响结果——
       这里没有任何规则和 admin.css 抢同一个选择器。
  以后往这里加样式时请保持同样的约束：只写本页独占的类名。
-->
<style>
.graph-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color-page);
}

.graph-content {
    flex: 1;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 16px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.graph-network-box {
    flex: 1;
    min-height: 400px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
}

.graph-info {
    margin-top: 10px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    text-align: center;
}
</style>
