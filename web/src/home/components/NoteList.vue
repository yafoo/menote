<template>
<div class="note-list">
    <article v-for="item in items" :key="item.id" class="note-item">
        <h3>
            <RouterLink :to="`/note/${item.id}.html`">{{item.title || '无标题笔记'}}</RouterLink>
        </h3>
        <div class="note-meta">
            <span v-if="showCate && item.cate_name" class="cate">{{item.cate_name}}</span>
            <span v-if="item.time">{{item.time}}</span>
        </div>
        <div v-if="item.tags.length" class="tags">
            <span v-for="tag in item.tags" :key="tag" class="tag">{{tag}}</span>
        </div>
    </article>
</div>
</template>

<script setup>
import {computed} from 'vue';
import { formatTime, splitTags } from '@/home/utils/index.js';

// 首页 / 分类页 / 搜索页共用的笔记列表
// 各页展示的元信息略有差异（首页带分类，分类页不带），用 prop 控制
const props = defineProps({
    notes: {type: Array, default: () => []},
    showCate: {type: Boolean, default: true},
    showTime: {type: Boolean, default: false}
});

// 模板里原来对每条笔记各调 2 次 formatTime、2~3 次 splitTags
// （v-if 判一次、插值/v-for 再各算一次），列表一长就是成百次重复计算，
// 而且每次重渲染都重跑一遍。这里预计算成带 time / tags 字段的列表。
//
// 用 computed 而不是改 notes 本身：notes 是外部传进来的 prop，
// 在里面塞派生字段会污染调用方的数据。
const items = computed(() => props.notes.map(note => ({
    ...note,
    time: formatTime(note.add_time, props.showTime),
    tags: splitTags(note.keywords)
})));
</script>
