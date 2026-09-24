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
import {ref, watch, onMounted} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '@/home/api/index.js';
import {store} from '@/home/store/index.js';
import {flattenCates} from '@/home/utils/index.js';
import NoteList from '@/home/components/NoteList.vue';

const PAGE_SIZE = 20;

const route = useRoute();

// 当前分类 id 必须**每次从 route 现读**，不能在 setup 里存成常量。
// /cate/3 → /cate/4 是同一条路由只换 params，Vue Router 会复用组件实例：
// setup 不重跑、onMounted 不再触发，常量会永远停在进入时那个分类上——
// 表现就是"URL 和导航高亮都换了，列表还是上一个分类的"。
const currentId = () => Number(route.params.id);

const cate = ref(null);
const notes = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(true);
const loadingMore = ref(false);

const fetchPage = async (id, p) => {
    const res = await api.notes({cate_id: id, page: p, rows: PAGE_SIZE});
    if(res.state === 1) {
        notes.value = p === 1 ? res.data.list : [...notes.value, ...res.data.list];
        total.value = res.data.total;
    }
};

const loadMore = async () => {
    loadingMore.value = true;
    page.value += 1;
    await fetchPage(currentId(), page.value);
    loadingMore.value = false;
};

// 加载某个分类。抽成函数是因为"分类页 → 分类页"要能重跑一遍
const loadCate = async (id) => {
    loading.value = true;
    // 复位分页：否则从 /cate/3 的第 2 页切到 /cate/4 会接着往后累加
    page.value = 1;
    notes.value = [];
    total.value = 0;

    // 分类信息从公开分类树里取（服务端没有单独的"取分类"公开接口，
    // 而分类树本来就要给 header 导航用，不必重复请求）。
    // 查不到 == 该分类不存在或未公开，两种情况的对外表现一致即可。
    await store.init();
    cate.value = flattenCates(store.cates).find(c => Number(c.id) === id) || null;

    if(cate.value) {
        await fetchPage(id, 1);
        store.setTitle(cate.value.name);
    } else {
        store.setTitle('分类不存在');
    }
    loading.value = false;
};

onMounted(() => loadCate(currentId()));

// 在 header 导航里点另一个分类，URL 变了但组件不会重建，得自己监听。
// 判 route.name 是为了避开"离开本页"那一次触发（此时 params.id 会是 undefined）。
// 同样的坑在 NoteView 也踩过（点反向链接切笔记），那边已有同名 watch。
watch(() => route.params.id, (v) => {
    if(v && route.name === 'cate') loadCate(Number(v));
});
</script>
