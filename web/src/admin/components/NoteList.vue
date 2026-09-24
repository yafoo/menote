<template>
<div class="note-list">
    <div class="note-list-header">
        <div class="note-list-title-wrap">
            <span class="note-list-title">{{ store.currentCateName }}</span>
            <span class="note-list-count">{{ store.notesTotal }}</span>
        </div>
        <div class="note-list-header-actions">
            <el-button size="small" text @click="createNote" title="新建笔记">
                <el-icon><Plus /></el-icon>
            </el-button>
            <el-button size="small" text class="toggle-note-list-btn" @click="store.noteListHidden = !store.noteListHidden" title="收起笔记列表">
                <el-icon><DArrowLeft /></el-icon>
            </el-button>
        </div>
    </div>
    <div class="note-list-search">
        <el-input
            v-model="searchKeyword"
            placeholder="搜索笔记..."
            clearable
            @input="onSearch"
            @clear="onSearch"
            size="small"
        >
            <template #prefix>
                <el-icon><Search /></el-icon>
            </template>
        </el-input>
    </div>
    <div class="note-list-body" ref="noteListBody" v-loading="store.notesLoading">
        <div v-if="store.notes.length === 0 && !store.notesLoading" class="note-list-empty">
            <span>暂无笔记</span>
        </div>
        <div
            v-for="note in store.notes"
            :key="note.id"
            class="note-item"
            :class="{ active: store.activeTabId === note.id, pinned: note.is_pinned }"
            @click="store.openNote(note.id)"
        >
            <div class="note-item-title">
                <el-icon v-if="note.is_pinned" class="pin-icon"><Top /></el-icon>
                <span class="note-item-name">{{ note.title || '无标题' }}</span>
                <span class="note-item-time">{{ formatTime(note.update_time || note.add_time) }}</span>
                <span class="note-item-actions" @click.stop>
                    <el-button size="small" text class="note-delete-btn" @click="deleteNote(note)">
                        <el-icon><Delete /></el-icon>
                    </el-button>
                    <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, note)">
                        <el-button size="small" text class="note-menu-btn">
                            <el-icon class="action-icon"><MoreFilled /></el-icon>
                        </el-button>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item command="rename">重命名</el-dropdown-item>
                                <el-dropdown-item command="edit">编辑笔记</el-dropdown-item>
                                <el-dropdown-item command="pin">{{ note.is_pinned ? '取消置顶' : '置顶' }}</el-dropdown-item>
                                <el-dropdown-item command="delete" divided>删除笔记</el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                </span>
            </div>
        </div>
    </div>
    <!-- 底部分页条（总数超过每页条数才显示；el-pagination small 模式） -->
    <div class="note-list-pagination" v-if="totalPages > 1">
        <el-pagination
            size="small"
            layout="prev, pager, next"
            :page-size="store.notesPageSize"
            :total="store.notesTotal"
            :current-page="store.notesPage"
            :pager-count="5"
            :disabled="store.notesLoading"
            @current-change="goPage"
        />
    </div>
</div>
</template>

<script setup>
import { api } from '@/admin/api/index.js';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { store } from '@/admin/store/index.js';
import Sortable from 'sortablejs';

const searchKeyword = ref('');
const noteListBody = ref(null);
let searchTimer = null;
let sortableInstance = null;

// 总页数（Math.max 防 total=0 时显示 0 页）
const totalPages = computed(() => Math.max(1, Math.ceil(store.notesTotal / store.notesPageSize)));

// 翻页（el-pagination @current-change 直传页码）：重新加载指定页（保持当前分类与搜索词）
const goPage = (page) => {
    if(!page || page < 1 || page > totalPages.value || page === store.notesPage) return;
    store.loadNotes(store.currentCateId, searchKeyword.value, page);
    // 翻页后列表滚回顶部
    nextTick(() => {
        if(noteListBody.value) noteListBody.value.scrollTop = 0;
    });
};

const initSortable = () => {
    if(!noteListBody.value) return;

    // 移动端禁用拖拽排序（避免滚动列表时误触）
    if(store.isMobile) {
        if(sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }
        return;
    }

    // 销毁旧实例
    if(sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = Sortable.create(noteListBody.value, {
        animation: 150,
        handle: '.note-item',
        filter: '.note-list-empty',
        onEnd: (evt) => {
            if(evt.oldIndex === evt.newIndex) return;

            // 更新 store.notes 数组顺序
            const moved = store.notes.splice(evt.oldIndex, 1)[0];
            store.notes.splice(evt.newIndex, 0, moved);

            // 收集排序数据并保存
            const items = store.notes.map((note, index) => ({
                id: note.id,
                sort: index
            }));

            api.sortNotes(items).then(res => {
                if(res.state === 1) {
                    ElMessage.success('排序已保存');
                } else {
                    ElMessage.error(res.msg);
                    store.loadNotes(store.currentCateId);
                }
            });
        }
    });
};

const onSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        store.loadNotes(store.currentCateId, searchKeyword.value);
    }, 300);
};

const formatTime = (timestamp) => {
    if(!timestamp) return '';
    const d = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if(isToday) {
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if(d.toDateString() === yesterday.toDateString()) {
        return '昨天';
    }
    if(d.getFullYear() === now.getFullYear()) {
        return (d.getMonth() + 1) + '/' + d.getDate();
    }
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
};

const handleCommand = async (command, note) => {
    if(command === 'rename') {
        try {
            const { value } = await ElMessageBox.prompt('请输入新的标题', '重命名', {
                inputValue: note.title || '无标题',
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                inputValidator: (val) => {
                    if(!val) return '标题不能为空';
                    return true;
                }
            });

            const res = await api.updateNote({ id: note.id, title: value });
            if(res.state === 1) {
                note.title = value;
                ElMessage.success('重命名成功');
                // 更新缓存和 Tab（含乐观锁基准，防止打开编辑器后保存自我冲突）
                if(store.notesCache[note.id]) {
                    store.notesCache[note.id].title = value;
                    if(res.data && res.data.update_time) {
                        store.notesCache[note.id].update_time = res.data.update_time;
                    }
                }
                const tab = store.tabs.find(t => t.id === note.id);
                if(tab) {
                    tab.title = value;
                }
            } else {
                ElMessage.error(res.msg);
            }
        } catch(e) {
            // 用户取消
        }
    } else if(command === 'edit') {
        store.openNote(note.id);
    } else if(command === 'pin') {
        const newPinned = note.is_pinned ? 0 : 1;
        const res = await api.pinNote(note.id, newPinned);
        if(res.state === 1) {
            note.is_pinned = newPinned;
            ElMessage.success(newPinned ? '已置顶' : '已取消置顶');
            // 更新缓存
            if(store.notesCache[note.id]) {
                store.notesCache[note.id].is_pinned = newPinned;
            }
            // 刷新笔记列表以更新排序
            store.loadNotes(store.currentCateId);
        } else {
            ElMessage.error(res.msg);
        }
    } else if(command === 'delete') {
        try {
            await ElMessageBox.confirm('确定要删除这篇笔记吗？删除后无法恢复。', '删除确认', {
                confirmButtonText: '确定删除',
                cancelButtonText: '取消',
                type: 'warning'
            });

            const res = await api.deleteNote(note.id);
            if(res.state === 1) {
                ElMessage.success('删除成功');
                store.closeTab(note.id, true);
                // 刷新列表
                store.loadNotes(store.currentCateId, searchKeyword.value);
            } else {
                ElMessage.error(res.msg);
            }
        } catch(e) {
            // 用户取消
        }
    }
};

const deleteNote = async (note) => {
    try {
        await ElMessageBox.confirm('确定要删除这篇笔记吗？删除后无法恢复。', '删除确认', {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning'
        });

        const res = await api.deleteNote(note.id);
        if(res.state === 1) {
            ElMessage.success('删除成功');
            store.closeTab(note.id, true);
            // 刷新列表
            store.loadNotes(store.currentCateId, searchKeyword.value);
        } else {
            ElMessage.error(res.msg);
        }
    } catch(e) {
        // 用户取消
    }
};

// 新建笔记（列表头部加号）
const createNote = async () => {
    const res = await api.createNote({
        title: '无标题笔记',
        cate_id: store.currentCateId || null,
        content: ''
    });

    if(res.state === 1) {
        const newNote = {
            id: res.data.id,
            title: '无标题笔记',
            cate_id: store.currentCateId || null,
            content: '',
            keywords: '',
            is_pinned: 0
        };

        store.notesCache[newNote.id] = newNote;
        store.addTab(newNote);
        store.loadNotes(store.currentCateId);
        ElMessage.success('笔记已创建');
    } else {
        ElMessage.error(res.msg);
    }
};

// 监听分类切换，重新加载笔记
watch(() => store.currentCateId, (newVal) => {
    store.loadNotes(newVal, searchKeyword.value);
});

// 初始加载
onMounted(async () => {
    await store.loadNotes(store.currentCateId);
    // 等待 DOM 更新后初始化 SortableJS
    nextTick(() => {
        initSortable();
    });
});

// 监听笔记列表变化，重新初始化 SortableJS
watch(() => store.notes.length, () => {
    nextTick(() => {
        initSortable();
    });
});

// 移动端状态切换时重新初始化/销毁拖拽
watch(() => store.isMobile, () => {
    nextTick(() => {
        initSortable();
    });
});
</script>
