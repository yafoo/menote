<template>
<div class="note-list">
    <article v-for="note in notes" :key="note.id" class="note-item">
        <h3>
            <RouterLink :to="`/note/${note.id}.html`">{{note.title || '无标题笔记'}}</RouterLink>
        </h3>
        <div class="note-meta">
            <span v-if="showCate && note.cate_name" class="cate">{{note.cate_name}}</span>
            <span v-if="formatTime(note.add_time, showTime)">{{formatTime(note.add_time, showTime)}}</span>
        </div>
        <div v-if="splitTags(note.keywords).length" class="tags">
            <span v-for="tag in splitTags(note.keywords)" :key="tag" class="tag">{{tag}}</span>
        </div>
    </article>
</div>
</template>

<script setup>
import { formatTime, splitTags } from '@/home/utils/index.js';

// 首页 / 分类页 / 搜索页共用的笔记列表
// 各页展示的元信息略有差异（首页带分类，分类页不带），用 prop 控制
defineProps({
    notes: {type: Array, default: () => []},
    showCate: {type: Boolean, default: true},
    showTime: {type: Boolean, default: false}
});
</script>
