<template>
<div class="container">
    <!-- 头部导航（对应旧 layout.htm 的 header） -->
    <header class="header">
        <RouterLink to="/" class="logo">
            <img src="/logo.png" alt="" class="logo-img">
            {{store.site.sitename || 'MeNote'}}
        </RouterLink>
        <nav class="nav">
            <!-- 分类图标来自数据（cate.icon），所以导航里保留 emoji；
                 "图谱"/"管理" 是固定入口，去掉装饰性 emoji 更干净 -->
            <RouterLink v-for="cate in store.cates" :key="cate.id" :to="`/cate/${cate.id}`">
                {{cate.icon}} {{cate.name}}
            </RouterLink>
            <RouterLink to="/graph">图谱</RouterLink>
            <a href="/admin" class="admin-link" title="管理后台">管理</a>
        </nav>
        <form class="search-form" @submit.prevent="doSearch">
            <input type="text" v-model="keyword" placeholder="搜索笔记…" aria-label="搜索笔记">
            <!-- 内联 SVG 而不是 🔍 emoji：emoji 是彩色位图，跟陶土色按钮的扁平感冲突 -->
            <button type="submit" aria-label="搜索" title="搜索">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.9"/>
                    <line x1="10.9" y1="10.9" x2="14.2" y2="14.2" stroke="currentColor"
                          stroke-width="1.9" stroke-linecap="round"/>
                </svg>
            </button>
        </form>
    </header>

    <!-- 主内容 -->
    <main class="main">
        <RouterView/>
    </main>

    <!-- 底部 -->
    <footer class="footer">
        <p>Powered by <a href="https://github.com/yafoo/menote" target="_blank" rel="noopener">MeNote</a></p>
    </footer>
</div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '@/home/store/index.js';

const router = useRouter();
const keyword = ref('');

const doSearch = () => {
    router.push({path: '/search', query: {q: keyword.value}});
};

onMounted(() => store.init());
</script>
