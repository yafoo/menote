import { ElMessage } from 'element-plus';
import { reactive } from 'vue';
import { request, api } from '@/admin/api/index.js';

export const store = reactive({
    // 用户信息
    user: null,
    username: '',

    // 分类数据（树形）
    categories: [],
    currentCateId: null,

    // Tab 管理
    tabs: [],
    activeTabId: null,

    // 未保存提示弹窗（关闭 Tab 时）
    unsavedDialogVisible: false,
    unsavedTabId: null,

    // 笔记列表
    notes: [],
    notesTotal: 0,
    notesLoading: false,
    // 分页（后端 /api/note/list 已支持 page/rows）
    notesPage: 1,
    notesPageSize: 20,

    // 笔记数据缓存
    notesCache: {},

    // 移动端：笔记列表是否隐藏
    noteListHidden: false,

    // 移动端状态：是否手机、当前单栏视图（list=笔记列表 / editor=编辑器）、分类抽屉
    isMobile: false,
    mobileView: 'list',
    mobileSidebarOpen: false,
    // 抽屉"还原现场"时跳过滑出动效（no-anim 类），正常开关不受影响
    sidebarNoAnim: false,

    // 打开分类抽屉（移动端）
    openSidebar() {
        if(this.isMobile) {
            if(!this.mobileSidebarOpen) {
                this.sidebarNoAnim = false;    // 正常打开：带滑出动效
                this.mobileSidebarOpen = true;
                history.pushState({ mekSidebar: true }, '');
            }
        } else {
            this.mobileSidebarOpen = true;
        }
    },

    // 关闭分类抽屉（移动端；consumeHistory=true 由遮罩点击/手势触发，避免二次 back；
    // 跳转路由前关闭传 false——标记条目留在栈里，返回 workspace 时由 popstate 重新打开）
    closeSidebar(consumeHistory = true) {
        if(this.mobileSidebarOpen) {
            this.sidebarNoAnim = false;    // 恢复动效：遮罩/按钮关闭是主动操作，滑动收回
            this.mobileSidebarOpen = false;
            if(this.isMobile && consumeHistory && history.state && history.state.mekSidebar) {
                history.back();
            }
        }
    },

    // 侧栏路由按钮（设置/用户/图谱/Token/P2P）：先关抽屉再跳转。
    // 抽屉关闭时保留栈里的 mekSidebar 标记（不 back）——从目标页返回时
    // popstate 落到该标记条目，抽屉重新打开，还原离开前的现场；
    // 再按一次返回才真正关抽屉（pop 标记条目，走正常手势链）。
    navigateFromSidebar(path) {
        this.closeSidebar(false);
        window.__routerPush && window.__routerPush(path);
    },

    // 进入编辑器视图（移动端单栏模式）
    // 同时压入一个历史记录，让安卓返回手势先回列表而不是退出页面
    enterEditor() {
        if(this.isMobile) {
            if(this.mobileView !== 'editor') {
                history.pushState({ mekEditor: true }, '');
            }
            this.mobileView = 'editor';
        }
    },

    // 返回列表视图（移动端单栏模式）
    backToList() {
        if(this.isMobile) {
            this.mobileView = 'list';
            // 若历史栈里有编辑器标记，回退消费掉它（返回手势触发时走 popstate 分支）
            if(history.state && history.state.mekEditor) {
                history.back();
            }
        }
    },

    // 响应移动端状态变化（窗口尺寸切换）
    updateMobileState() {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth <= 768;
        if(wasMobile && !this.isMobile) {
            // 切回桌面：重置单栏状态
            this.mobileView = 'list';
            this.mobileSidebarOpen = false;
        }
    },

    // 初始化
    async init() {
        this.updateMobileState();
        window.addEventListener('resize', () => this.updateMobileState());

        // 安卓返回手势拦截：优先还原分类抽屉现场，其次关抽屉/回列表，不退出页面
        window.addEventListener('popstate', () => {
            if(!this.isMobile) return;
            if(history.state && history.state.mekSidebar) {
                // 落在抽屉标记条目：两种情形——
                // ① 抽屉正开着（直接手势关闭，正常链路）
                // ② 抽屉关着（从设置等页面返回 workspace）→ 重新打开抽屉还原现场
                if(this.mobileSidebarOpen) {
                    this.sidebarNoAnim = false;    // 正常链路：后续开关恢复动效
                    this.mobileSidebarOpen = false;
                } else {
                    // 从设置等页面返回 workspace：无动效直接显示，
                    // 给人"抽屉一直开着"的感觉，消除二次滑出的怪异观感
                    this.sidebarNoAnim = true;
                    this.mobileSidebarOpen = true;
                }
            } else if(this.mobileSidebarOpen) {
                // 标记条目已不在栈顶（路由跳转顶掉了 state 对象位置），单纯关抽屉
                this.mobileSidebarOpen = false;
            } else if(history.state && history.state.mekEditor) {
                // 编辑器标记条目（进编辑器前抽屉未关的罕见交错）：只回列表
                this.mobileView = 'list';
            } else if(this.mobileView === 'editor') {
                this.mobileView = 'list';
            }
        });

        await this.loadUserInfo();
        await this.loadCategories();
        await this.loadNotes(this.currentCateId);
    },

    // 加载用户信息
    async loadUserInfo() {
        try {
            const data = await request('/api/user/info');
            if(data.state === 1) {
                this.user = data.data;
                this.username = data.data.username || '';
            }
        } catch(e) {
            console.error('加载用户信息失败', e);
        }
    },

    // 加载分类（树形）
    async loadCategories() {
        try {
            const data = await request('/api/cate/tree');
            if(data.state === 1) {
                const tree = data.data || [];
                // 在头部插入"全部笔记"虚拟节点
                this.categories = [
                    { id: null, name: '全部笔记', icon: '📁', is_virtual: true, children: [] },
                    ...tree
                ];
            }
        } catch(e) {
            console.error('加载分类失败', e);
        }
    },

    // 加载笔记列表（分页；resetPage=true 时回到第 1 页——搜索/切分类/建笔记）
    async loadNotes(cateId, keyword = '', page = null, resetPage = false) {
        this.notesLoading = true;
        try {
            if(resetPage || page === null) {
                page = 1;
            }
            const params = new URLSearchParams();
            if(cateId !== null && cateId !== undefined) {
                params.set('cate_id', cateId);
            }
            params.set('rows', this.notesPageSize);
            params.set('page', page);
            if(keyword) params.set('q', keyword);
            const data = await request(`/api/note/list?${params}`);
            if(data.state === 1) {
                this.notes = data.data.list || [];
                this.notesTotal = data.data.total || 0;
                this.notesPage = page;
            } else {
                ElMessage.error(data.msg || '加载笔记列表失败');
            }
        } catch(e) {
            console.error('加载笔记列表失败', e);
        } finally {
            this.notesLoading = false;
        }
    },

    // 打开笔记（从列表点击）
    async openNote(id) {
        // 如果已在 Tab 中，直接切换
        const existing = this.tabs.find(t => t.id === id);
        if(existing) {
            this.activeTabId = id;
            this.enterEditor();
            return;
        }

        // 加载笔记详情
        const note = await this.loadNote(id);
        if(note) {
            this.addTab({ id: note.id, title: note.title });
        }
    },

    // 加载笔记详情
    async loadNote(id) {
        if(this.notesCache[id]) {
            return this.notesCache[id];
        }

        try {
            const data = await request(`/api/note/detail?id=${id}`);
            if(data.state === 1) {
                // 将 cate_id 为 0 转为 null，避免 el-select 显示 0
                if(data.data.cate_id === 0) {
                    data.data.cate_id = null;
                }
                this.notesCache[id] = data.data;
                return data.data;
            } else {
                ElMessage.error(data.msg || '加载笔记失败');
            }
        } catch(e) {
            console.error('加载笔记失败', e);
        }
        return null;
    },
    
    // 添加 Tab
    addTab(note) {
        const existing = this.tabs.find(t => t.id === note.id);
        if(existing) {
            this.activeTabId = existing.id;
            return;
        }
        
        this.tabs.push({
            id: note.id,
            title: note.title || '无标题',
            modified: false
        });

        this.activeTabId = note.id;
        this.enterEditor();

        // 加载笔记数据
        this.loadNote(note.id);
    },
    
    // 关闭 Tab
    // skipConfirm: 跳过未保存确认（内部复用：先保存再关闭）
    async closeTab(id, skipConfirm = false) {
        const index = this.tabs.findIndex(t => t.id === id);
        if(index === -1) return;

        // 如果有修改，提示用户
        const tab = this.tabs[index];
        if(tab.modified && !skipConfirm) {
            this.unsavedTabId = id;
            this.unsavedDialogVisible = true;
            return;
        }

        this.tabs.splice(index, 1);

        // 如果关闭的是当前激活的 Tab
        if(this.activeTabId === id) {
            if(this.tabs.length > 0) {
                const newIndex = Math.max(0, index - 1);
                this.activeTabId = this.tabs[newIndex].id;
            } else {
                this.activeTabId = null;
                // 移动端：最后一个 Tab 关闭后回到列表
                this.backToList();
            }
        }
    },

    // 取消关闭（留在当前页）
    cancelUnsavedClose() {
        this.unsavedDialogVisible = false;
        this.unsavedTabId = null;
    },

    // 放弃修改并关闭
    discardUnsavedClose() {
        const id = this.unsavedTabId;
        this.unsavedDialogVisible = false;
        if(id === null) return;
        this.unsavedTabId = null;
        // 清掉缓存，下次打开重新拉服务端数据
        delete this.notesCache[id];
        this.closeTab(id, true);
    },

    // 保存修改并关闭（保存失败则留在当前页）
    async saveUnsavedClose() {
        const id = this.unsavedTabId;
        if(id === null) return;
        const note = this.notesCache[id];
        if(!note) {
            // 无缓存数据，只能放弃
            this.discardUnsavedClose();
            return;
        }
        if(!note.title) {
            ElMessage.warning('请输入标题');
            return;
        }
        const noteData = {
            id: note.id,
            title: note.title,
            cate_id: note.cate_id,
            content: note.content,
            keywords: note.keywords,
            is_pinned: note.is_pinned,
            update_time: note.update_time
        };
        try {
            const res = await api.updateNote(noteData);
            if(res.state === 1) {
                this.unsavedDialogVisible = false;
                this.unsavedTabId = null;
                // 刷新乐观锁基准
                if(res.data && res.data.update_time) {
                    note.update_time = res.data.update_time;
                }
                const tab = this.tabs.find(t => t.id === id);
                if(tab) {
                    tab.title = note.title;
                    tab.modified = false;
                }
                this.loadNotes(this.currentCateId);
                ElMessage.success('已保存并关闭');
                this.closeTab(id, true);
            } else if(res.data && res.data.conflict) {
                // 冲突：关闭未保存弹窗，弹出冲突引导弹窗
                this.unsavedDialogVisible = false;
                this.showConflictDialog(id);
            } else {
                ElMessage.error(res.msg);
            }
        } catch(e) {
            ElMessage.error('保存失败，请重试');
        }
    },
    
    // ---- 笔记编辑冲突（乐观锁）----
    // 保存时服务端发现 update_time 与客户端基准不一致（他端已保存过），
    // 弹窗让用户选择：备份本地内容 / 放弃本地修改并重新获取
    conflictDialogVisible: false,
    conflictTabId: null,
    showConflictDialog(id) {
        this.conflictTabId = id;
        this.conflictDialogVisible = true;
    },
    // 关闭冲突弹窗（留在当前页，用户自行备份内容后再操作）
    closeConflictDialog() {
        this.conflictDialogVisible = false;
    },
    // 放弃本地修改，重新拉取服务端最新数据并刷新编辑器
    async reloadAfterConflict() {
        const id = this.conflictTabId;
        this.conflictDialogVisible = false;
        this.conflictTabId = null;
        if(id === null) return;

        // 不清缓存再加载（delete 会让 v-if="note" 短暂为 false，编辑器 DOM 被销毁，
        // Vditor 实例失联——直接整体替换 notesCache[id]，视图始终有数据）
        try {
            const data = await request(`/api/note/detail?id=${id}`);
            if(data.state !== 1) {
                ElMessage.error('重新获取失败，请重试');
                return;
            }
            const fresh = data.data;
            // 与 loadNote 一致：cate_id 0 转 null，避免 el-select 显示 0
            if(fresh.cate_id === 0) {
                fresh.cate_id = null;
            }
            this.notesCache[id] = fresh;

            const tab = this.tabs.find(t => t.id === id);
            if(tab) {
                tab.title = fresh.title;
                tab.modified = false;
            }
            this.loadNotes(this.currentCateId);
            ElMessage.success('已重新获取最新内容');
        } catch(e) {
            console.error('重新获取笔记失败', e);
            ElMessage.error('重新获取失败，请重试');
        }
    },

    // 标记 Tab 已修改
    markModified(id) {
        const tab = this.tabs.find(t => t.id === id);
        if(tab) {
            tab.modified = true;
        }
    },

    // ---- 编辑器内容强制同步钩子 ----
    // Vditor 的 input 事件在输入法组合中/防抖窗口内可能未触发，content 停留旧值；
    // 保存前必须强制从编辑器拉取最新内容（否则出现"保存成功但内容没变"）。
    // NoteEditor 挂载时注册，卸载时清除。
    editorSync: null,   // (noteId) => void：把 vditorInstance 当前值写回 note.content
    registerEditorSync(fn) {
        this.editorSync = fn;
    },
    /** 保存前调用：同步当前编辑器内容到 store（未注册或笔记未打开时静默跳过） */
    syncEditorContent() {
        try {
            this.editorSync && this.editorSync();
        } catch(e) {
            console.error('编辑器内容同步失败', e);
        }
    },
    
    // 获取当前 Tab
    get activeTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    },
    
    // 获取当前笔记数据
    get currentNote() {
        if(!this.activeTabId) return null;
        return this.notesCache[this.activeTabId];
    },

    // 未保存弹窗展示的标题（取实时缓存值，编辑过也能正确显示）
    get unsavedNoteTitle() {
        if(this.unsavedTabId === null) return '';
        return this.notesCache[this.unsavedTabId]?.title || '无标题';
    },

    // 当前分类名（移动端 header 展示用）
    get currentCateName() {
        if(this.currentCateId === null || this.currentCateId === undefined) {
            return '全部笔记';
        }
        let found = null;
        const walk = (items) => {
            for(const item of items) {
                if(item.id === this.currentCateId) { found = item; return; }
                if(item.children?.length) walk(item.children);
            }
        };
        walk(this.categories);
        return found ? (found.icon ? found.icon + ' ' + found.name : found.name) : '笔记';
    }
});
