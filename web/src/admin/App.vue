<template>
    <!-- Element Plus 按需引入后，语言包改由 ConfigProvider 提供
         （此前是 app.use(ElementPlus, {locale: zhCn})）。
         分页器"上一页/下一页"、表格空态等文案都依赖它 -->
    <el-config-provider :locale="zhCn">
        <router-view/>
    </el-config-provider>
</template>

<script setup>
import { onMounted } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { store } from '@/admin/store/index.js';
import { initTheme } from '@/shared/theme.js';

// 首屏配色由外壳里的内联脚本定好了（见 web/admin.html），这里只对齐 JS 状态
// 并挂上"系统主题变化"的监听。放在 setup 顶层而不是 onMounted，是为了让
// 主题切换按钮第一帧就显示正确的图标
initTheme();

onMounted(() => store.init());
</script>
