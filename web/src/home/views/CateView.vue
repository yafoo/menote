<template>
<div class="page-cate">
    <p v-if="loading" class="page-loading">加载中…</p>

    <div v-else-if="!cate" class="empty">
        <p>分类不存在或未公开</p>
    </div>

    <template v-else>
        <header class="cate-header">
            <h1>{{cate.icon}} {{cate.name}}</h1>
            <p class="cate-desc">共 {{total}} 篇笔记</p>
        </header>

        <NoteList v-if="notes.length" :notes="notes" :show-cate="false" :show-time="true"/>
        <div v-else class="empty">
            <p>该分类下还没有笔记</p>
        </div>

        <p v-if="notes.length < total" class="load-more">
            <button type="button" :disabled="loadingMore" @click="loadMore">
                {{loadingMore ? '加载中…' : '加载更多'}}
            </button>
        </p>
    </template>
</div>
</template>

<script setup>
import {ref, onMounted} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '@/home/api/index.js';
import {store} from '@/home/store/index.js';
import {flattenCates} from '@/home/utils/index.js';
import NoteList from '@/home/components/NoteList.vue';

const PAGE_SIZE = 20;

const route = useRoute();
const cateId = Number(route.params.id);

const cate = ref(null);
const notes = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(true);
const loadingMore = ref(false);

const fetchPage = async (p) => {
    const res = await api.notes({cate_id: cateId, page: p, rows: PAGE_SIZE});
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
    // 分类信息从公开分类树里取（服务端没有单独的"取分类"公开接口，
    // 而分类树本来就要给 header 导航用，不必重复请求）。
    // 查不到 == 该分类不存在或未公开，两种情况的对外表现一致即可。
    await store.init();
    cate.value = flattenCates(store.cates).find(c => Number(c.id) === cateId) || null;

    if(cate.value) {
        await fetchPage(1);
        store.setTitle(cate.value.name);
    } else {
        store.setTitle('分类不存在');
    }
    loading.value = false;
});
</script>
