<template>
<article class="page-note">
    <p v-if="loading" class="page-loading">加载中…</p>

    <div v-else-if="!note" class="empty">
        <p>笔记不存在或未公开</p>
    </div>

    <template v-else>
        <header class="note-header">
            <h1>{{note.title || '无标题笔记'}}</h1>
            <div class="note-meta">
                <!-- 分类做成链接，顺手多一条回到分类页的路径 -->
                <RouterLink v-if="note.cate_id" :to="`/cate/${note.cate_id}`" class="cate">
                    {{note.cate_name}}
                </RouterLink>
                <span v-if="formatTime(note.add_time, true)">{{formatTime(note.add_time, true)}}</span>
                <span v-if="splitTags(note.keywords).length" class="tags">
                    <span v-for="tag in splitTags(note.keywords)" :key="tag" class="tag">{{tag}}</span>
                </span>
            </div>
        </header>

        <!-- 正文由 Vditor.preview 渲染（含代码高亮、公式、表格等） -->
        <div ref="contentEl" class="note-content vditor-reset"></div>

        <div v-if="note.backlinks && note.backlinks.length" class="backlinks">
            <h3>反向链接</h3>
            <ul>
                <li v-for="link in note.backlinks" :key="link.id">
                    <RouterLink :to="`/note/${link.id}.html`">{{link.title}}</RouterLink>
                </li>
            </ul>
        </div>
    </template>
</article>
</template>

<script setup>
import {ref, watch, nextTick, onMounted} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '@/home/api/index.js';
import {store} from '@/home/store/index.js';
import {formatTime, splitTags} from '@/home/utils/index.js';
import {resolvedTheme} from '@/shared/theme.js';

const route = useRoute();

const note = ref(null);
const loading = ref(true);
const contentEl = ref(null);

// Vditor 按需加载：只有笔记详情页需要它（约 291KB）。
// 静态 import 的话首页/列表页也要白白下载一份。
// 加载一次后缓存 Promise，同一次会话内切笔记不重复请求。
let vditorPromise = null;
const loadVditor = () => {
    if(!vditorPromise) {
        vditorPromise = Promise.all([
            import('vditor'),
            import('vditor/dist/index.css')
        ]).then(([mod]) => mod.default);
    }
    return vditorPromise;
};

// 渲染 Markdown。
// cdn 指向自托管的 /static/vendor/vditor（由 web/vendor-vditor.mjs 生成）——
// Vditor 运行时仍会按 cdn 去取 lute（引擎）、icons、代码主题等，不能省。
//
// mode / hljs.style 跟着当前主题走：
//   · mode 决定 Vditor 自己那套（图片预览遮罩等）的明暗
//   · hljs.style 是代码块的语法高亮配色。自托管目录里只有 github 系三套
//     （见 public/static/vendor/vditor/dist/js/highlight.js/styles），
//     暗色用 github-dark，它的 #0d1117 底跟我们的 --bg-sunk 很接近
const renderContent = async () => {
    if(!note.value || !contentEl.value) return;
    const content = note.value.content || '';
    contentEl.value.innerHTML = '';
    if(!content.trim()) return;

    const dark = resolvedTheme.value === 'dark';
    const Vditor = await loadVditor();
    await Vditor.preview(contentEl.value, content, {
        mode: dark ? 'dark' : 'light',
        hljs: {style: dark ? 'github-dark' : 'github'},
        anchor: 1,
        cdn: '/static/vendor/vditor'
    });
};

const loadNote = async (id) => {
    loading.value = true;
    note.value = null;
    const res = await api.note(id);
    if(res.state === 1) {
        note.value = res.data;
        store.setTitle(res.data.title || '无标题笔记');
    } else {
        store.setTitle('笔记不存在');
    }
    loading.value = false;
    await nextTick();
    await renderContent();
};

onMounted(() => loadNote(Number(route.params.id)));

// 点反向链接会切到另一篇笔记，同一个组件实例被复用，必须监听参数变化
watch(() => route.params.id, (id) => {
    if(id && route.name === 'note') loadNote(Number(id));
});

// 切主题要重渲染：Vditor 的语法高亮配色是渲染时按 hljs.style 动态挂 <link> 的，
// 只换 CSS 变量救不了代码块里的 token 颜色（它们是写死的十六进制）
watch(resolvedTheme, () => {
    if(note.value) renderContent();
});
</script>
