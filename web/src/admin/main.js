// MeNote 管理后台入口
//
// ── Element Plus 按需引入 ─────────────────────────────────────────────
// 此前用 `app.use(ElementPlus)` 全量注册，会把全部 ~90 个组件连同整套
// theme-chalk CSS 都打进包。现改为显式列出用到的组件（29 个）。
//
// ⚠️ 新增 Element Plus 组件时，下面三处都要改，漏一处就有问题：
//    1. `import {...} from 'element-plus'`  —— 漏了 → 模板里是未知标签，静默不渲染
//    2. COMPONENTS 对象                     —— 漏了 → 同上（只有模板里写 <el-xxx> 才需要；
//                                              脚本里 new 出来用的不必注册）
//    3. `import 'element-plus/es/components/<name>/style/css'`
//                                            —— 漏了 → 组件能渲染但没有样式（裸 HTML）
//    组件样式入口会自动带上它依赖的组件样式（如 select → scrollbar/popper/tag/option、
//    table → scrollbar/tooltip/checkbox），所以只写顶层组件即可。
//    目录名用 kebab-case，与模板标签一致；不确定就先 `ls node_modules/element-plus/es/components`。

// 样式顺序：Element Plus → Vditor → 项目自定义（自定义必须最后，覆盖优先级才对）
import 'element-plus/es/components/aside/style/css';
import 'element-plus/es/components/badge/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/checkbox/style/css';
import 'element-plus/es/components/checkbox-group/style/css';
import 'element-plus/es/components/config-provider/style/css';
import 'element-plus/es/components/container/style/css';
import 'element-plus/es/components/dialog/style/css';
import 'element-plus/es/components/dropdown/style/css';
import 'element-plus/es/components/dropdown-item/style/css';
import 'element-plus/es/components/dropdown-menu/style/css';
import 'element-plus/es/components/empty/style/css';
import 'element-plus/es/components/form/style/css';
import 'element-plus/es/components/form-item/style/css';
import 'element-plus/es/components/icon/style/css';
import 'element-plus/es/components/input/style/css';
import 'element-plus/es/components/input-number/style/css';
import 'element-plus/es/components/loading/style/css';
import 'element-plus/es/components/main/style/css';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/pagination/style/css';
import 'element-plus/es/components/popover/style/css';
import 'element-plus/es/components/select/style/css';
import 'element-plus/es/components/switch/style/css';
import 'element-plus/es/components/tab-pane/style/css';
import 'element-plus/es/components/table/style/css';
import 'element-plus/es/components/table-column/style/css';
import 'element-plus/es/components/tabs/style/css';
import 'element-plus/es/components/tag/style/css';
import 'element-plus/es/components/tooltip/style/css';
import 'element-plus/es/components/tree/style/css';
import 'vditor/dist/index.css';
import './styles/admin.css';

import { createApp } from 'vue';
import {
    ElAside, ElBadge, ElButton, ElCheckbox, ElCheckboxGroup, ElConfigProvider,
    ElContainer, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty,
    ElForm, ElFormItem, ElIcon, ElInput, ElInputNumber, ElLoading, ElMain,
    ElOption, ElPagination, ElPopover, ElSelect, ElSwitch, ElTabPane, ElTable,
    ElTableColumn, ElTabs, ElTag, ElTooltip, ElTree
} from 'element-plus';
// 图标按需：模板里以 <Plus /> <ArrowLeft /> 形式使用。
// 此前 `import * as ElementPlusIconsVue` 全量注册 ~290 个图标，每个都是
// 一个 defineComponent + 内联 SVG path，全量进包非常浪费。
import {
    ArrowLeft, Check, Connection, CopyDocument, DArrowLeft, Delete, Grid,
    InfoFilled, Key, Menu, MoreFilled, Plus, Refresh, Search, Setting,
    Share, SwitchButton, Top, User, View
} from '@element-plus/icons-vue';
import App from './App.vue';
import { router } from './router/index.js';

const COMPONENTS = {
    ElAside, ElBadge, ElButton, ElCheckbox, ElCheckboxGroup, ElConfigProvider,
    ElContainer, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty,
    ElForm, ElFormItem, ElIcon, ElInput, ElInputNumber, ElMain,
    ElOption, ElPagination, ElPopover, ElSelect, ElSwitch, ElTabPane, ElTable,
    ElTableColumn, ElTabs, ElTag, ElTooltip, ElTree
};

// 图标：模板里按 PascalCase 使用（<Plus />），注册名即变量名
const ICONS = {
    ArrowLeft, Check, Connection, CopyDocument, DArrowLeft, Delete, Grid,
    InfoFilled, Key, Menu, MoreFilled, Plus, Refresh, Search, Setting,
    Share, SwitchButton, Top, User, View
};

const app = createApp(App);

// 注册名用 comp.name（如 'ElButton'），Vue 解析 <el-button> 时会自动
// 做 camelize + capitalize 匹配，所以模板里继续写 kebab-case 即可
for(const comp of Object.values(COMPONENTS)) {
    app.component(comp.name, comp);
}
for(const [name, comp] of Object.entries(ICONS)) {
    app.component(name, comp);
}

// v-loading 指令 + $loading。它不是组件，全量安装时由 app.use(ElementPlus) 顺带注册，
// 按需引入后必须显式 app.use(ElLoading)（见 NoteList/GraphView 等处的 v-loading）
app.use(ElLoading);

// 语言包不再走 app.use(ElementPlus, {locale})，改由 App.vue 里的
// <el-config-provider :locale="zhCn"> 提供（分页器文案等依赖它）
app.use(router);

app.mount('#app');
