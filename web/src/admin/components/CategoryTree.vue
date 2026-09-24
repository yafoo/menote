<template>
<div class="category-tree">
    <div class="tree-header">
        <span class="tree-title">分类</span>
        <el-button size="small" text class="tree-add-btn" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
        </el-button>
    </div>
    <el-tree
        :data="categories"
        :props="treeProps"
        node-key="id"
        highlight-current
        default-expand-all
        :indent="20"
        draggable
        :allow-drop="allowDrop"
        :allow-drag="allowDrag"
        @node-drop="handleDrop"
        @node-click="handleNodeClick"
    >
        <template #default="{ node, data }">
            <div class="tree-node">
                <span class="node-content">
                    <span v-if="data.icon" class="node-icon">{{ data.icon }}</span>
                    <span class="node-name">{{ data.name }}</span>
                    <el-tag v-if="data.is_public" size="small" type="success">公开</el-tag>
                </span>
                <span v-if="!data.is_virtual" class="node-actions" @click.stop>
                    <el-button size="small" text class="node-addnote-btn" @click="createNoteInCate(data.id)">
                        <el-icon><Plus /></el-icon>
                    </el-button>
                    <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, data)">
                        <el-button size="small" text class="node-menu-btn">
                            <el-icon class="action-icon"><MoreFilled /></el-icon>
                        </el-button>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item command="add">新建子分类</el-dropdown-item>
                                <el-dropdown-item command="edit">编辑分类</el-dropdown-item>
                                <el-dropdown-item command="delete" divided>删除分类</el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                </span>
            </div>
        </template>
    </el-tree>

    <!-- 添加/编辑分类对话框（点遮罩不关：表单防误触 + 防 emoji 弹窗变孤儿） -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="400px" append-to-body :close-on-click-modal="false">
        <el-form :model="cateForm" label-width="80px">
            <el-form-item label="图标">
                <div class="icon-selector">
                    <!-- 直接输入/粘贴 emoji 的输入框（文字放大显示） -->
                    <el-input
                        v-model="iconInput"
                        placeholder="输入 emoji"
                        class="icon-input"
                        clearable
                        @input="onIconInput"
                    />
                    <!-- 选择按钮：点开 emoji 分组弹窗（visible 受控，选中即关） -->
                    <el-popover
                        :visible="emojiPickerVisible"
                        trigger="click"
                        placement="bottom"
                        :width="300"
                        @hide="emojiPickerVisible = false"
                    >
                        <template #reference>
                            <el-button class="icon-pick-btn" title="选择 emoji" @click="emojiPickerVisible = !emojiPickerVisible">
                                <el-icon><Grid /></el-icon>
                            </el-button>
                        </template>
                        <template #default>
                            <div class="emoji-picker">
                                <!-- 分组标签：单行横向滑动，不换行 -->
                                <div class="emoji-groups">
                                    <span
                                        v-for="g in emojiGroups"
                                        :key="g.label"
                                        class="emoji-group-tab"
                                        :class="{ active: activeEmojiGroup === g.label }"
                                        @click="activeEmojiGroup = g.label"
                                    >{{ g.label }}</span>
                                </div>
                                <!-- 当前分组网格（限高滚动） -->
                                <div class="icon-grid emoji-scroll">
                                    <span
                                        v-for="emoji in activeGroupEmojis"
                                        :key="emoji"
                                        class="icon-item"
                                        :class="{ active: cateForm.icon === emoji }"
                                        @click="selectIcon(emoji)"
                                    >{{ emoji }}</span>
                                </div>
                            </div>
                        </template>
                    </el-popover>
                </div>
            </el-form-item>
            <el-form-item label="上级分类">
                <el-select v-model="cateForm.pid" placeholder="无（作为顶级分类）" clearable filterable>
                    <el-option
                        v-for="cate in selectableParents"
                        :key="cate.id"
                        :label="cate.name"
                        :value="cate.id"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="名称">
                <el-input v-model="cateForm.name" placeholder="分类名称" />
            </el-form-item>
            <el-form-item label="公开性">
                <el-switch v-model="cateForm.is_public" active-text="公开" inactive-text="私密" />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" @click="saveCate">保存</el-button>
        </template>
    </el-dialog>

    <div class="tree-footer">
        <div class="user-info" @click="store.navigateFromSidebar('/admin/profile')">
            <el-icon><User /></el-icon>
            <span class="username">{{ store.username || '未登录' }}</span>
        </div>
        <div class="tree-footer-actions">
            <!-- 主题切换：三个模式共用一个按钮，点一次轮换一次。
                 当前模式写在 title 里，图标随之变化 -->
            <el-button size="small" text @click="cycleThemeMode" :title="`主题：${THEME_LABELS[themeMode]}（点击切换）`">
                <el-icon v-if="themeMode === 'light'"><Sunny /></el-icon>
                <el-icon v-else-if="themeMode === 'dark'"><Moon /></el-icon>
                <el-icon v-else><Monitor /></el-icon>
            </el-button>

            <el-button size="small" text @click="goToHome" title="访问前台首页">
                <el-icon><View /></el-icon>
            </el-button>
            <el-button size="small" text @click="logout" title="退出登录">
                <el-icon><SwitchButton /></el-icon>
            </el-button>

            <!-- 更多：低频入口收进弹出菜单，放在最右一格。
                 原来这里一排七个图标挤在 220px 宽的侧栏里，每个都得靠 title 才知道
                 是什么；收成三个常用 + 一个「更多」之后，图标能大一点、也认得出了。
                 菜单项保留原图标，点完走 navigateFromSidebar（会先关掉移动端抽屉）。
                 placement 用 top-end 而不是 top-start：按钮已经贴到最右边了，
                 菜单若还是左对齐按钮就会往右飘出侧栏；右对齐向左展开才落在侧栏内 -->
            <el-dropdown trigger="click" placement="top-end" @command="handleFooterCommand">
                <el-button size="small" text title="更多">
                    <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                    <el-dropdown-menu>
                        <el-dropdown-item command="/admin/settings">
                            <el-icon><Setting /></el-icon>站点设置
                        </el-dropdown-item>
                        <el-dropdown-item command="/admin/tokens">
                            <el-icon><Key /></el-icon>Token 管理
                        </el-dropdown-item>
                        <el-dropdown-item command="/admin/graph">
                            <el-icon><Share /></el-icon>知识图谱
                        </el-dropdown-item>
                        <el-dropdown-item command="/admin/p2p">
                            <el-icon><Connection /></el-icon>P2P 管理
                        </el-dropdown-item>
                    </el-dropdown-menu>
                </template>
            </el-dropdown>
        </div>
    </div>
</div>
</template>

<script setup>
import { ElMessage, ElMessageBox } from 'element-plus';
import { ref, reactive, computed, watch } from 'vue';
import { request, api } from '@/admin/api/index.js';
import { store } from '@/admin/store/index.js';
import { THEME_LABELS, themeMode, cycleThemeMode } from '@/shared/theme.js';

// 模板 el-tree 的 :data 来源。
// 迁移前这是 setup() 末尾 return 块里的内联 computed（categories: computed(...)），
// 改 <script setup> 后必须提到顶层，否则模板拿不到绑定、分类树空白。
const categories = computed(() => store.categories);

const dialogVisible = ref(false);
const dialogTitle = ref('添加分类');

// emoji 分组数据：常用组保留原有 30 个；其余按语义分组，覆盖日常分类场景
const emojiGroups = [
    { label: '常用', emojis: [
        '📁', '📚', '📝', '💼', '🎯', '💡', '🔬', '🎨', '🎵', '📷',
        '🏠', '🌟', '🔥', '💎', '🎁', '📖', '💻', '📊', '📈', '🎓',
        '🌈', '☕', '🍎', '🚀', '⚡', '🎪', '🎭', '🎲', '🏆', '🔔'
    ] },
    { label: '表情', emojis: [
        '😀', '😂', '😊', '😍', '🤔', '😎', '🥳', '😴', '😢', '😡',
        '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '🤞', '👀', '🧠',
        '❤️', '💔', '💯', '🎉', '🥰', '😜', '🤗', '😌', '🫡', '🤩'
    ] },
    { label: '动植物', emojis: [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁',
        '🐯', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦉',
        '🐴', '🦄', '🐝', '🦋', '🐢', '🐍', '🐙', '🦀', '🐬', '🐳',
        '🌵', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🌻',
        '🌷', '🌸', '🌹', '🌺', '🌾', '🍁', '🍄', '🌰', '💐', '🪴'
    ] },
    { label: '食物', emojis: [
        '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑',
        '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆', '🥕', '🌽', '🥔',
        '🍞', '🥐', '🥨', '🧀', '🍳', '🥓', '🍗', '🍖', '🌭', '🍔',
        '🍟', '🍕', '🥪', '🌮', '🍜', '🍣', '🍱', '🍚', '🍲', '🍰',
        '🎂', '🍫', '🍬', '🍭', '🍩', '🍪', '☕', '🍵', '🧋', '🍺'
    ] },
    { label: '活动', emojis: [
        '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏓', '🏸', '🥅', '🎿',
        '🏊', '🚴', '🏃', '🧘', '🏋️', '🤸', '⛹️', '🤾', '⛳', '🏹',
        '🎮', '🕹️', '🎲', '🧩', '🎯', '🎨', '🎸', '🎹', '🎺', '🎻',
        '🥁', '🎤', '🎧', '🎬', '🎭', '🎪', '🎫', '🏆', '🥇', '🏅'
    ] },
    { label: '物品', emojis: [
        '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💾', '💿', '📀',
        '📷', '📹', '🎥', '📞', '📺', '📻', '⏰', '⏱️', '🔑', '🔒',
        '🧰', '🔧', '🔨', '🪛', '🧲', '💉', '💊', '🩹', '🚗', '🚕',
        '🚌', '🏎️', '✈️', '🚀', '🛸', '🚁', '⛵', '🚲', '🛴', '🛵'
    ] },
    { label: '自然', emojis: [
        '🌞', '🌝', '🌚', '⭐', '🌟', '✨', '⚡', '☄️', '🌈', '❄️',
        '🔥', '💧', '🌊', '☁️', '⛅', '🌪️', '🌫️', '🌙', '🌎', '🌍',
        '🌏', '🌋', '⛰️', '🏔️', '🏕️', '🏖️', '🏜️', '🏝️', '🌾', '🌿'
    ] },
    { label: '符号', emojis: [
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💗', '💓',
        '✅', '❌', '❗', '❓', '❕', '💯', '🔔', '🔕', '🎵', '🎶',
        '➕', '➖', '➗', '✖️', '♾️', '🔴', '🟡', '🟢', '🔵', '⚫'
    ] }
];
const activeEmojiGroup = ref('常用');
// emoji 选择弹窗受控开关：选中即自动关（trigger=click 与受控 visible 共存时，
// 点击外部由 @hide 归位，点选图标由 selectIcon 主动关）
const emojiPickerVisible = ref(false);
const activeGroupEmojis = computed(() =>
    (emojiGroups.find(g => g.label === activeEmojiGroup.value) || emojiGroups[0]).emojis
);

// 手动输入 emoji（输入框）：取首个字符组（emoji 可能是多 code point）
const iconInput = ref('');
const onIconInput = (val) => {
    const v = String(val || '').trim();
    if(v) {
        // 用 [...v] 展开 code point（代理对正确处理），取第一个 emoji
        cateForm.icon = [...v][0];
    }
};

// dialog 任何方式关闭（esc/取消/保存/树刷新）时复位 emoji 弹窗——
// 防止 popover 挂在 body 上变成无锚点的孤儿层
watch(dialogVisible, (v) => { if(!v) emojiPickerVisible.value = false; });

const cateForm = reactive({
    id: null,
    pid: 0,
    icon: '📁',
    name: '',
    is_public: false
});

// 上级分类可选项：排除自身及其后代（防循环引用）
const selectableParents = computed(() => {
    const result = [{ id: 0, name: '无（顶级分类）' }];
    if(!cateForm.id) {
        // 新建：所有真实分类均可作上级
        const walk = (items, prefix = '') => {
            for(const item of items) {
                if(item.is_virtual) continue;
                const label = prefix + (item.icon ? item.icon + ' ' : '') + item.name;
                result.push({ id: item.id, name: label });
                if(item.children?.length) walk(item.children, label + ' / ');
            }
        };
        walk(store.categories);
    } else {
        const walk = (items, prefix = '', skipBranch = false) => {
            for(const item of items) {
                if(item.is_virtual) continue;
                const isSelf = item.id === cateForm.id;
                const label = prefix + (item.icon ? item.icon + ' ' : '') + item.name;
                if(!isSelf && !skipBranch) {
                    result.push({ id: item.id, name: label });
                }
                if(item.children?.length) {
                    walk(item.children, label + ' / ', skipBranch || isSelf);
                }
            }
        };
        walk(store.categories);
    }
    return result;
});

const handleNodeClick = (data) => {
    if(data.is_virtual) {
        // 点击"全部笔记"虚拟节点
        store.currentCateId = null;
    } else {
        store.currentCateId = data.id;
    }
    // 移动端：选择分类后收起抽屉
    if(store.isMobile) {
        store.closeSidebar();
    }
};

// 分类树配置
const treeProps = {
    label: 'name',
    children: 'children'
};

// 拖拽控制：虚拟节点不允许拖拽
const allowDrag = (draggingNode) => {
    return !draggingNode.data.is_virtual;
};

// 拖拽控制：不允许放到虚拟节点内部
const allowDrop = (draggingNode, dropNode, type) => {
    if(dropNode.data.is_virtual) {
        return false;
    }
    // 不允许拖到"全部笔记"下面成为子节点
    return true;
};

// 拖拽结束：保存排序
const handleDrop = (draggingNode, dropNode, dropType, ev) => {
    // 收集所有分类的排序数据
    const items = [];
    const collectItems = (nodes, pid, sortBase) => {
        let sort = sortBase;
        for(const node of nodes) {
            if(node.is_virtual) continue;
            items.push({ id: node.id, sort: sort, pid: pid });
            sort++;
            if(node.children && node.children.length > 0) {
                sort = collectItems(node.children, node.id, sort);
            }
        }
        return sort;
    };

    // 遍历分类树（跳过虚拟节点"全部笔记"）
    const realCats = store.categories.filter(c => !c.is_virtual);
    collectItems(realCats, 0, 0);

    // 调用后端保存排序
    api.sortCate(items).then(res => {
        if(res.state === 1) {
            ElMessage.success('排序已保存');
        } else {
            ElMessage.error(res.msg);
            // 刷新恢复
            store.loadCategories();
        }
    });
};

const selectIcon = (emoji) => {
    cateForm.icon = emoji;
    iconInput.value = emoji;          // 输入框与选中态同步
    emojiPickerVisible.value = false;  // 选中即关弹窗
};

// 打开新增/编辑分类弹窗。
// 三个入口（顶栏加号 / 菜单「新建子分类」/ 菜单「编辑分类」）只是预填值不同，
// 表单字段的复位逻辑集中在这里，避免三处各抄一遍、漏改一处
const openDialog = ({ title, id = null, pid = 0, icon = '📁', name = '', isPublic = false }) => {
    dialogTitle.value = title;
    cateForm.id = id;
    cateForm.pid = pid;
    cateForm.icon = icon;
    cateForm.name = name;
    cateForm.is_public = isPublic;
    // 新建时输入框留空（显示 placeholder），编辑时回填当前图标
    iconInput.value = id ? icon : '';
    activeEmojiGroup.value = '常用';   // 每次打开回到默认分组
    dialogVisible.value = true;
};

const showAddDialog = () => {
    openDialog({ title: '添加分类', pid: store.currentCateId || 0 });
};

const handleCommand = async(command, data) => {
    if(command === 'add') {
        openDialog({ title: '添加子分类', pid: data.id });
    } else if(command === 'edit') {
        openDialog({
            title: '编辑分类',
            id: data.id,
            pid: data.pid,
            icon: data.icon || '📁',
            name: data.name,
            isPublic: data.is_public === 1
        });
    } else if(command === 'delete') {
        try {
            await ElMessageBox.confirm(
                `确定删除分类「${data.name}」吗？`,
                '删除确认',
                {
                    confirmButtonText: '确定删除',
                    cancelButtonText: '取消',
                    type: 'warning'
                }
            );
            const res = await api.deleteCate(data.id);
            if(res.state === 1) {
                ElMessage.success('删除成功');
                store.loadCategories();
            } else {
                ElMessage.error(res.msg);
            }
        } catch(e) {
            // 用户取消
        }
    }
};

const saveCate = async () => {
    if(!cateForm.name) {
        ElMessage.warning('请输入分类名称');
        return;
    }

    const data = {
        ...cateForm,
        icon: cateForm.icon || '📁',
        is_public: cateForm.is_public ? 1 : 0
    };

    let res;
    if(cateForm.id) {
        res = await api.updateCate(data);
    } else {
        res = await api.createCate(data);
    }

    if(res.state === 1) {
        ElMessage.success('保存成功');
        dialogVisible.value = false;
        store.loadCategories();
    } else {
        ElMessage.error(res.msg);
    }
};

// 分类节点上的加号：先切到该分类（笔记列表会跟着刷新），再新建一篇挂进去
const createNoteInCate = async (cateId) => {
    store.currentCateId = cateId;
    await store.createNote(cateId);
};

// 底部「更多」菜单的命令处理。菜单项的 command 就是目标路由，
// 直接复用侧栏跳转（会先关掉移动端抽屉，再 push）
const handleFooterCommand = (path) => {
    store.navigateFromSidebar(path);
};

const logout = async () => {
    try {
        await ElMessageBox.confirm(
            '确定要退出登录吗？',
            '退出确认',
            {
                confirmButtonText: '确定退出',
                cancelButtonText: '取消',
                type: 'warning'
            }
        );
        // AJAX 退出（复用统一 request 封装）：成功后 location.replace
        // 替换历史——返回键不会回到已退出的 admin 页
        const res = await request('/admin/login/logout');
        if(res.state === 1) {
            location.replace(res.data || '/admin/login');
        } else {
            ElMessage.error(res.msg || '退出失败');
        }
    } catch(e) {
        // 用户取消确认框 / 网络异常：留在当前页
    }
};

const goToHome = async () => {
    try {
        await ElMessageBox.confirm(
            '确定要访问前台首页吗？',
            '跳转确认',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'info'
            }
        );
        // noopener：新开的前台页面拿不到本页的 window.opener，
        // 否则它可以通过 window.opener.location 把后台标签页改到钓鱼页
        window.open('/', '_blank', 'noopener');
    } catch(e) {
        // 用户取消确认框：留在当前页
    }
};
</script>
