<template>
<div class="page-search">
    <header class="search-header">
        <h2 class="section-title">搜索结果</h2>
        <p v-if="q" class="search-query">
            关键词 <strong>{{q}}</strong> · 找到 {{notes.length}} 条结果
        </p>
    </header>

    <p v-if="loading" class="page-loading">搜索中…</p>
    <NoteList v-else-if="notes.length" :notes="notes" :show-cate="true"/>
    <div v-else class="empty">
        <p v-if="q">没有找到相关笔记</p>
        <p v-else>输入关键词开始搜索</p>
    </div>
</div>
</template>

<script setup>
import {ref, watch, onMounted} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '@/home/api/index.js';
import {store} from '@/home/store/index.js';
import NoteList from '@/home/components/NoteList.vue';

const route = useRoute();

const q = ref('');
const notes = ref([]);
const loading = ref(false);

const runSearch = async (keyword) => {
    q.value = keyword;
    if(!keyword) {
        notes.value = [];
        return;
    }
    loading.value = true;
    const res = await api.search(keyword);
    if(res.state === 1) {
        notes.value = res.data.list || [];
    }
    loading.value = false;
};

onMounted(() => {
    runSearch(String(route.query.q || '').trim());
    store.setTitle('搜索');
});

// header 里再次搜索时 URL query 变化，组件不会重建，得监听
watch(() => route.query.q, (v) => {
    if(route.name !== 'search') return;
    runSearch(String(v || '').trim());
});
</script>
