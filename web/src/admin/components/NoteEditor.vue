<template>
<div class="note-editor" :class="{ 'meta-collapsed': store.isMobile && !metaExpanded }" v-if="note">
    <div class="editor-header">
        <input
            v-model="note.title"
            class="title-input"
            placeholder="笔记标题"
            @input="markModified"
        />
        <el-button
            class="mobile-meta-toggle"
            size="small"
            text
            @click="metaExpanded = !metaExpanded"
            :title="metaExpanded ? '收起属性与工具栏' : '展开属性与工具栏'"
        >
            <el-icon><InfoFilled /></el-icon>
        </el-button>
    </div>
    <div class="editor-meta" v-show="!store.isMobile || metaExpanded">
        <div class="meta-item">
            <label>分类</label>
            <el-select v-model="note.cate_id" size="small" placeholder="选择分类" @change="markModified" clearable>
                <el-option
                    v-for="cate in flatCategories"
                    :key="cate.id"
                    :label="cate.name"
                    :value="cate.id"
                />
            </el-select>
        </div>
        <div class="meta-item">
            <label>标签</label>
            <el-input
                v-model="note.keywords"
                size="small"
                placeholder="逗号分隔，如：python,编程"
                @input="markModified"
            />
        </div>
        <div class="meta-item">
            <el-switch v-model="note.is_pinned" :active-value="1" :inactive-value="0" active-text="置顶" @change="markModified" />
        </div>
    </div>
    <div class="editor-content">
        <div id="vditor"></div>
    </div>
    <div class="backlinks-panel" v-if="backlinks && backlinks.length > 0">
        <div class="backlinks-header">
            <el-icon><Connection /></el-icon>
            <span>反向链接 ({{backlinks.length}})</span>
        </div>
        <div class="backlinks-list">
            <a v-for="link in backlinks" :key="link.id" class="backlink-item" @click.prevent="openBacklink(link)">
                {{link.title || '无标题'}}
            </a>
        </div>
    </div>
</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { store } from '@/admin/store/index.js';
import { resolvedTheme } from '@/shared/theme.js';
import Vditor from 'vditor';
// Vditor 的样式表放在这里、而不是 main.js 的入口样式区：
// 编辑器只占后台极小一部分使用时长（打开笔记才需要），但它光是 CSS 就有 8 kB gzip。
// 放入口 = 每个打开后台的人（包括只看列表的）都要下载它。
//
// ⚠️ 覆盖顺序：本文件末尾的 <style> 块里有针对 .vditor 的覆盖规则，
//    它必须排在 Vditor 自带样式**之后**。构建时 Vite 会按模块图顺序把两者
//    拼进同一个 chunk CSS，SFC 的 <style> 块排在 script 里的 import 之后，
//    顺序天然正确；但如果你把下面这行挪到别处（比如挪进入口样式区），
//    覆盖规则就会跑到 Vditor 基础样式前面去，编辑器外观会变样。
import 'vditor/dist/index.css';

const vditor = ref(null);
const metaExpanded = ref(false);
let vditorInstance = null;

const note = computed(() => store.currentNote);

const flatCategories = computed(() => {
    const flat = [];
    const flatten = (items, prefix = '') => {
        for(const item of items) {
            flat.push({
                id: item.id,
                name: prefix + (item.icon ? item.icon + ' ' : '') + item.name
            });
            if(item.children?.length) {
                flatten(item.children, prefix + (item.icon ? item.icon + ' ' : '') + item.name + ' / ');
            }
        }
    };
    flatten(store.categories);
    return flat;
});

// Vditor 的主题不像 EP 那样跟着 CSS 变量走，必须显式给三个：
//   · theme              编辑器外壳（classic / dark）——工具栏、光标、正文底色
//   · preview.theme      内容主题，实际是去拉 dist/css/content-theme/<名字>.css
//   · preview.hljs.style 代码块高亮，对应 dist/js/highlight.js/styles/<名字>.min.css
// 三个都得给，只给其中一两个会出现"工具栏变暗了但正文还是白底"这种半吊子状态。
// 这三个值都取自自托管白名单（见 web/vendor-vditor.mjs 的 CONTENT_THEMES / CODE_THEMES）
const isDark = () => resolvedTheme.value === 'dark';
const vdTheme = () => (isDark() ? 'dark' : 'classic');
const vdContentTheme = () => (isDark() ? 'dark' : 'light');
const vdCodeTheme = () => (isDark() ? 'github-dark' : 'github');

// Vditor 工具栏：
// - PC 端不配置 = Vditor 官方默认全量工具栏
// - 移动端基于默认清单排除低频/遮挡项：emoji、语音(record)、更多(more)、缩进(outdent/indent)
const getToolbar = () => {
    if(!store.isMobile) {
        return undefined; // 默认工具栏
    }
    return [
        'headings', 'bold', 'italic', 'strike', 'link', '|',
        'list', 'ordered-list', 'check', '|',
        'quote', 'line', 'code', 'inline-code', '|',
        'insert-before', 'insert-after', 'upload', 'table', '|',
        'undo', 'redo', '|',
        'fullscreen', 'edit-mode'
    ];
};

// 同步上传关联的笔记 ID。
// Vditor 实例只创建一次、切 Tab 复用；且实例上没有 options 属性
//（选项存在内部 vditor.options），上传时 Vditor 读 vditor.options.upload.extraData，
// 故须写内部对象。笔记未就绪时删除该字段，让后端走默认值
const syncUploadNoteId = () => {
    const upload = vditorInstance && vditorInstance.vditor && vditorInstance.vditor.options
        && vditorInstance.vditor.options.upload;
    if(!upload || !upload.extraData) return;
    if(note.value && note.value.id) {
        upload.extraData.note_id = String(note.value.id);
    } else {
        delete upload.extraData.note_id;
    }
};

const initVditor = () => {
    if(vditorInstance) {
        vditorInstance.destroy();
    }

    const toolbar = getToolbar();

    vditorInstance = new Vditor('vditor', {
        height: '100%',
        mode: 'wysiwyg',
        // 按当前主题决定编辑器/内容/代码三套主题，否则默认永远是 classic + light
        theme: vdTheme(),
        preview: {
            theme: { current: vdContentTheme() },
            hljs: { style: vdCodeTheme() }
        },
        ...(toolbar ? { toolbar } : {}),
        toolbarConfig: {
            pin: true
        },
        placeholder: '开始写作...',
        cache: { enable: false },
        cdn: '/static/vendor/vditor',
        lang: 'zh_CN',
        upload: {
            url: '/api/upload/index',
            fieldName: 'file',
            maxFileSize: 10 * 1024 * 1024,
            accept: 'image/*, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .zip, .rar, .7z',
            format: (files, responseText) => {
                const res = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;
                if(res.state === 1 && res.data && res.data.url) {
                    const succMap = {};
                    succMap[res.data.filename || files[0].name] = res.data.url;
                    return JSON.stringify({ code: 0, msg: '', data: { succMap, errFiles: [] } });
                }
                return JSON.stringify({ code: 1, msg: res.msg || '上传失败', data: { succMap: {}, errFiles: [files[0].name] } });
            },
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        },
        after: () => {
            if(note.value) {
                vditorInstance.setValue(note.value.content || '');
            }
            // 编辑器就绪后才存在 vditor.options，同步当前笔记 ID
            syncUploadNoteId();
        },
        input: () => {
            if(note.value) {
                note.value.content = vditorInstance.getValue();
                store.markModified(note.value.id);
            }
        }
    });
};

const markModified = () => {
    if(note.value) {
        store.markModified(note.value.id);
    }
};

// 注册「保存前强制同步」钩子：从 vditorInstance 拉最新内容写回 note.content。
// input 事件在输入法组合中/防抖窗口内可能未触发，直接读 note.content 会保存旧值。
store.registerEditorSync(() => {
    if(note.value && vditorInstance) {
        const latest = vditorInstance.getValue();
        if(latest !== (note.value.content || '')) {
            note.value.content = latest;
        }
    }
});
onUnmounted(() => {
    if(store.editorSync) store.registerEditorSync(null);
});

// 切主题时不重建 Vditor——重建会丢掉光标位置和撤销栈。setTheme 就够，
// 它会换掉外壳 class、内容主题 link 和代码高亮 link 三处
watch(resolvedTheme, () => {
    if(!vditorInstance) return;
    vditorInstance.setTheme(vdTheme(), vdContentTheme(), vdCodeTheme());
});

watch(() => store.activeTabId, async () => {
    await nextTick();
    if(note.value && vditorInstance) {
        vditorInstance.setValue(note.value.content || '');
    }
});

onMounted(() => {
    // 编辑器容器在 v-if="note" 内，note 已就绪才初始化
    if(note.value) {
        initVditor();
    }
});

// note 异步加载到达后再初始化 Vditor（容器此时才存在）；
// 对象被整体替换（编辑冲突后"重新获取"）时，同步编辑器显示最新内容
watch(note, (val) => {
    if(!val) return;
    if(!vditorInstance) {
        nextTick(() => {
            if(!vditorInstance) {
                initVditor();
            }
        });
        return;
    }
    const latest = val.content || '';
    // 内容有差异才重设（切换 Tab 时与 activeTabId 的 watch 重复触发，此守卫保证幂等）
    if(vditorInstance.getValue() !== latest) {
        vditorInstance.setValue(latest);
    }
    // 切到别的笔记后，上传要关联到新笔记
    syncUploadNoteId();
});

const backlinks = computed(() => {
    if(note.value && note.value.backlinks) {
        return note.value.backlinks;
    }
    return [];
});

const openBacklink = (link) => {
    store.openNote(link.id);
};
</script>

<!--
    以下规则原本散落在 admin.css 的「笔记编辑器」章节和文件末尾的移动端
    @media 块里。挪进组件内的原因有两条：

    1. 覆盖顺序：它们针对的是 Vditor 自带样式，必须排在 vditor/dist/index.css
       之后。入口样式表（admin.css）永远先于懒加载 chunk 的 CSS 被应用，
       留在那边反而会被 Vditor 的基础样式盖回去（见 script 顶部的说明）。
    2. 归属：这些选择器只对 Vditor 的 DOM 有意义，Vditor 只在这里出现。

    不加 scoped：Vditor 的 DOM 是 JS 运行时插进 #vditor 的，没有 SFC 的
    scope 属性，scoped 会编译成 .vditor[data-v-xxx] 而匹配不到。
-->
<style>
/* 容器：撑满 .editor-content 的剩余高度（.editor-content 是 flex 列） */
#vditor {
    flex: 1;
    min-height: 0;
}

/* Vditor 的暗色配色是靠 .vditor--dark 里一组 CSS 变量控制的，自带的是
   GitHub Dark 那套（--panel-background-color: #24292e，偏蓝灰）。
   压在青瓷暗色（#121817，偏青绿）的面板上像贴了块补丁。
   这里只换变量值、不逐个元素覆盖，Vditor 自己的层次关系（面板 / 文本域 / 工具栏）
   保持原样。特异性上 html.dark .vditor 是 (0,2,0)，压得过 .vditor--dark 的 (0,1,0) */
html.dark .vditor {
    --panel-background-color: var(--el-bg-color-overlay);
    --textarea-background-color: var(--el-bg-color);
    --textarea-text-color: var(--el-text-color-primary);
    --toolbar-icon-color: var(--el-text-color-regular);
    --border-color: var(--el-border-color);
}

/* 代码块底色。
   Vditor 在 wysiwyg 模式下代码块有**两层**：可见的 .vditor-wysiwyg__pre（其中的 code
   没有 .hljs class，落在 content-theme 里 code:not(.hljs) 那条规则上，是半透明蓝底
   rgba(66,133,244,.36)）和隐藏的预览层（code 带 .hljs，底色来自 hljs 主题）。
   两层都要覆盖，否则编辑时看到蓝底、切到预览又变另一个色。
   不加 html.dark 前缀——浅色下同样存在（可见层浅蓝、预览层浅灰） */
.vditor .vditor-wysiwyg__pre code:not(.hljs):not(.highlight-chroma),
.vditor .vditor-reset pre code:not(.hljs):not(.highlight-chroma),
.vditor .hljs {
    background-color: var(--el-fill-color-light);
}

/* 行内代码：Vditor 默认也是那个半透明蓝，换成 primary 最浅档——
   浅色下是淡青（#e6f2f0），暗色下是深青（#15201e），两套主题都在青瓷色系里 */
.vditor .vditor-reset code:not(.hljs):not(.highlight-chroma) {
    background-color: var(--el-color-primary-light-9);
}

/* Vditor 样式调整 */
.vditor {
    border: none !important;
}

.vditor-toolbar {
    border-bottom: 1px solid var(--el-border-color-lighter) !important;
    background: var(--el-fill-color-lighter) !important;
    padding: 4px 8px !important;
}

/* 让编辑区域占满整个宽度 */
.vditor-ir__editor,
.vditor-wysiwyg__editor,
.vditor-sv {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}

/* 移动端：断点与 admin.css 的移动端块保持一致（768px） */
@media (max-width: 768px) {
    /* 折叠态：隐藏 Vditor 工具栏（点击 ℹ️ 展开） */
    .note-editor.meta-collapsed .vditor-toolbar {
        display: none !important;
    }

    /* 移动端隐藏工具按钮 tooltip（触屏无悬浮意义且易被遮挡裁切） */
    .vditor-toolbar .vditor-tip,
    .vditor-tooltipped::before,
    .vditor-tooltipped::after {
        display: none !important;
    }

    /* Vditor 工具栏横向滚动 */
    .vditor-toolbar {
        flex-wrap: nowrap !important;
        -webkit-overflow-scrolling: touch;
    }

    .vditor-toolbar::-webkit-scrollbar {
        display: none;
    }

    .vditor-toolbar__item {
        padding: 0 2px !important;
    }
}
</style>
