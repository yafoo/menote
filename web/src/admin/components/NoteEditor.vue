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
import Vditor from 'vditor';

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
