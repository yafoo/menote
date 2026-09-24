<template>
<div class="workspace">
    <!-- 移动端顶栏 -->
    <div class="mobile-header">
        <el-button v-if="store.mobileView === 'editor'" text @click="store.backToList()" class="mobile-back-btn">
            <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <el-button v-else text @click="store.mobileSidebarOpen ? store.closeSidebar() : store.openSidebar()" class="mobile-menu-btn">
            <el-icon><Menu /></el-icon>
        </el-button>
        <span class="mobile-title">
            <span class="mobile-title-text">{{ store.mobileView === 'editor' ? (store.activeTab ? store.activeTab.title : '编辑笔记') : store.currentCateName }}</span>
            <span v-if="store.mobileView !== 'editor'" class="note-list-count">{{ store.notesTotal }}</span>
        </span>
        <div class="mobile-header-actions">
            <el-button v-if="store.mobileView === 'editor' && store.tabs.length > 0" :text="store.activeTab && store.activeTab.modified ? false : true" :type="store.activeTab && store.activeTab.modified ? 'primary' : 'default'" @click="saveNote" class="mobile-save-btn" :title="store.activeTab && store.activeTab.modified ? '有未保存修改，点击保存' : '保存'" :icon="Check">
            </el-button>
            <el-button v-else text @click="store.createNote()" class="mobile-add-btn" title="新建笔记">
                <el-icon><Plus /></el-icon>
            </el-button>
        </div>
    </div>

    <!-- 遮罩层 -->
    <div class="sidebar-overlay" v-if="store.mobileSidebarOpen" @click="store.closeSidebar()"></div>

    <el-container>
        <el-aside width="220px" class="workspace-aside" :class="{ 'sidebar-visible': store.mobileSidebarOpen, 'no-anim': store.sidebarNoAnim }">
            <CategoryTree />
        </el-aside>
        <el-aside width="280px" class="note-list-aside" :class="{ 'note-list-hidden': store.noteListHidden, 'mobile-list-view': store.isMobile && store.mobileView === 'list', 'mobile-editor-behind': store.isMobile && store.mobileView === 'editor' }">
            <NoteList />
        </el-aside>
        <el-container class="workspace-main" :class="{ 'mobile-editor-view': store.isMobile && store.mobileView === 'editor' }">
            <el-main class="workspace-content">
                <div class="tabs-container" v-if="store.tabs.length > 0">
                    <div class="tabs-bar">
                        <el-tabs
                            v-model="store.activeTabId"
                            type="card"
                            closable
                            @tab-remove="handleTabRemove"
                        >
                            <el-tab-pane
                                v-for="tab in store.tabs"
                                :key="tab.id"
                                :label="tab.title"
                                :name="tab.id"
                            >
                                <template #label>
                                    <span class="tab-label">
                                        <span v-if="tab.modified" class="modified-dot"></span>
                                        <span class="tab-title" :title="tab.title">{{ tab.title }}</span>
                                    </span>
                                </template>
                            </el-tab-pane>
                        </el-tabs>
                        <div class="tabs-actions">
                            <el-button size="small" @click="deleteNote" :disabled="!store.activeTabId">
                                <el-icon><Delete /></el-icon> 删除
                            </el-button>
                            <el-button size="small" type="primary" :plain="store.activeTab && store.activeTab.modified ? false : true" @click="saveNote" :disabled="!store.activeTabId" :class="{ 'has-modified': store.activeTab && store.activeTab.modified }">
                                <el-icon><Check /></el-icon> 保存<span v-if="store.activeTab && store.activeTab.modified" class="modified-hint">●</span>
                            </el-button>
                        </div>
                    </div>

                    <!-- NoteEditor 是异步组件（内含 Vditor，约 291 kB JS），
                         首次打开笔记时才下载。fallback 只在下载/初始化期间出现 -->
                    <Suspense>
                        <NoteEditor />
                        <template #fallback>
                            <div class="editor-loading">编辑器加载中…</div>
                        </template>
                    </Suspense>
                </div>

                <div v-else class="empty-state">
                    <el-empty description="点击「新建笔记」开始创作">
                        <el-button type="primary" @click="store.createNote()">
                            <el-icon><Plus /></el-icon> 新建笔记
                        </el-button>
                    </el-empty>
                </div>
            </el-main>
        </el-container>
    </el-container>

    <!-- 未保存提示弹窗（关闭 Tab 时） -->
    <el-dialog
        v-model="store.unsavedDialogVisible"
        title="未保存的修改"
        width="360px"
        append-to-body
        :close-on-click-modal="false"
        @close="store.unsavedTabId = null"
    >
        <div class="unsaved-tip">笔记「{{ store.unsavedNoteTitle }}」有未保存的修改，是否保存？</div>
        <template #footer>
            <el-button @click="store.cancelUnsavedClose()">取消</el-button>
            <el-button @click="store.discardUnsavedClose()">放弃</el-button>
            <el-button type="primary" @click="store.saveUnsavedClose()">保存</el-button>
        </template>
    </el-dialog>

    <!-- 编辑冲突弹窗（保存时检测到他端已修改） -->
    <el-dialog
        v-model="store.conflictDialogVisible"
        title="保存失败：笔记已在其他地方被修改"
        width="420px"
        append-to-body
        :close-on-click-modal="false"
        @close="store.conflictTabId = null"
    >
        <div class="conflict-tip">
            <p>该笔记已在其他窗口、设备或外部程序中被编辑并保存过。</p>
            <p>为避免覆盖别人的修改，本次保存已被取消。建议：</p>
            <ol>
                <li>如需保留本地修改，请先<b>全选复制</b>编辑器内容自行备份；</li>
                <li>点击「<b>重新获取</b>」拉取最新数据后，再粘贴回来编辑保存。</li>
            </ol>
        </div>
        <template #footer>
            <el-button @click="store.closeConflictDialog()">留在本页（自行备份）</el-button>
            <el-button type="primary" @click="store.reloadAfterConflict()">重新获取最新内容</el-button>
        </template>
    </el-dialog>
</div>
</template>

<script setup>
import { api } from '@/admin/api/index.js';
import { Check } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { defineAsyncComponent } from 'vue';
import { store } from '@/admin/store/index.js';
import CategoryTree from '@/admin/components/CategoryTree.vue';
import NoteList from '@/admin/components/NoteList.vue';

// Vditor（291 kB JS + 40 kB CSS，gzip 约 79 kB）只在编辑笔记时才需要，而 Workspace
// 是 /admin 的默认路由——静态 import 等于每个打开后台的人都先下载整个编辑器。
// 改成异步组件后它单独成 chunk，第一次打开笔记才拉取（之后走浏览器缓存）
const NoteEditor = defineAsyncComponent(() => import('@/admin/components/NoteEditor.vue'));

const handleTabRemove = (id) => {
    store.closeTab(id);
};

const saveNote = async () => {
    if(!store.currentNote || !store.currentNote.title) {
        ElMessage.warning('请输入标题');
        return;
    }

    // 强制从编辑器拉取最新内容（input 事件可能未触发完，防"保存成功但内容没变"）
    store.syncEditorContent();

    // 过滤掉虚拟字段（来自 JOIN 查询），update_time 为乐观锁基准（加载数据时的版本）
    const noteData = {
        id: store.currentNote.id,
        title: store.currentNote.title,
        cate_id: store.currentNote.cate_id,
        content: store.currentNote.content,
        keywords: store.currentNote.keywords,
        is_pinned: store.currentNote.is_pinned,
        update_time: store.currentNote.update_time
    };

    const res = await api.updateNote(noteData);
    if(res.state === 1) {
        ElMessage.success('保存成功');
        // 刷新乐观锁基准，否则连续保存第二次会自我冲突
        if(res.data && res.data.update_time) {
            store.currentNote.update_time = res.data.update_time;
        }
        // 更新 Tab 标题
        const tab = store.tabs.find(t => t.id === store.currentNote.id);
        if(tab) {
            tab.title = store.currentNote.title;
            tab.modified = false;
        }
        store.loadNotes(store.currentCateId);
    } else if(res.data && res.data.conflict) {
        // 他端已保存过：弹窗引导用户备份本地内容后重新获取数据
        store.showConflictDialog(store.currentNote.id);
    } else {
        ElMessage.error(res.msg);
    }
};

const deleteNote = async () => {
    if(!store.currentNote) return;

    try {
        await ElMessageBox.confirm(
            '确定要删除这篇笔记吗？删除后无法恢复。',
            '删除确认',
            {
                confirmButtonText: '确定删除',
                cancelButtonText: '取消',
                type: 'warning'
            }
        );

        const res = await api.deleteNote(store.currentNote.id);
        if(res.state === 1) {
            ElMessage.success('删除成功');
            const deletedId = store.currentNote.id;
            store.closeTab(deletedId, true);
            store.loadNotes(store.currentCateId);
        } else {
            ElMessage.error(res.msg);
        }
    } catch(e) {
        // 用户取消操作
    }
};
</script>
