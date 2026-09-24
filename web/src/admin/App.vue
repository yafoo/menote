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

onMounted(() => store.init());
</script>
