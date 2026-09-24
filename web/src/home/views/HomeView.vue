<template>
<div class="page-home">
    <header class="list-head">
        <h2 class="section-title">最新笔记</h2>
        <span v-if="total" class="list-count">共 {{total}} 篇</span>
    </header>

    <p v-if="loading" class="page-loading">加载中…</p>
    <div v-else-if="!notes.length" class="empty">
        <p>这里还没有公开的笔记</p>
        <p>去后台写一篇吧</p>
    </div>
    <NoteList v-else :notes="notes" :show-cate="true"/>

    <!-- 分页：旧 SSR 版本只显示最新 20 篇且没有翻页，这里补上「加载更多」 -->
    <p v-if="!loading && notes.length < total" class="load-more">
        <button type="button" :disabled="loadingMore" @click="loadMore">
            {{loadingMore ? '加载中…' : '加载更多'}}
        </button>
    </p>
</div>
</template>

<script setup>
import {ref, onMounted} from 'vue';
import {api} from '@/home/api/index.js';
import {store} from '@/home/store/index.js';
import NoteList from '@/home/components/NoteList.vue';

const PAGE_SIZE = 20;

const notes = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(true);
const loadingMore = ref(false);

const fetchPage = async (p) => {
    const res = await api.notes({page: p, rows: PAGE_SIZE});
    if(res.state === 1) {
        notes.value = p === 1 ? res.data.list : [...notes.value, ...res.data.list];
        total.value = res.data.total;
    }
};

const loadMore = async () => {
    loadingMore.value = true;
    page.value += 1;
    await fetchPage(page.value);
    loadingMore.value = false;
};

onMounted(async () => {
    await fetchPage(1);
    loading.value = false;
    store.setTitle('');
});
</script>
