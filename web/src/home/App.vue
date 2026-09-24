<template>
<div class="container">
    <!-- 头部导航（对应旧 layout.htm 的 header） -->
    <header class="header">
        <RouterLink to="/" class="logo">
            <img src="/logo.png" alt="" class="logo-img">
            {{store.site.sitename || 'MeNote'}}
        </RouterLink>
        <nav class="nav">
            <!-- 分类图标来自数据（cate.icon），所以导航里保留 emoji；
                 "图谱"/"管理" 是固定入口，去掉装饰性 emoji 更干净。
                 分类要连子分类一起列（拍平）——只渲染顶层的话，
                 "测试分类"这种二级分类在导航里根本看不到 -->
            <RouterLink
                v-for="cate in navCates"
                :key="cate.id"
                :to="`/cate/${cate.id}`"
                :class="{'is-child': cate.depth > 0}"
            >
                {{cate.icon}} {{cate.name}}
            </RouterLink>
            <RouterLink to="/graph">图谱</RouterLink>
            <a href="/admin" class="admin-link" title="管理后台">管理</a>
        </nav>
        <div class="header-tools">
            <form class="search-form" @submit.prevent="doSearch">
                <input type="text" v-model="keyword" placeholder="搜索笔记…" aria-label="搜索笔记">
                <!-- 内联 SVG 而不是 🔍 emoji：emoji 是彩色位图，跟扁平色按钮的质感冲突 -->
                <button type="submit" aria-label="搜索" title="搜索">
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.9"/>
                        <line x1="10.9" y1="10.9" x2="14.2" y2="14.2" stroke="currentColor"
                              stroke-width="1.9" stroke-linecap="round"/>
                    </svg>
                </button>
            </form>
            <!-- 主题切换：三个模式共用一个按钮，点一次轮换一次 -->
            <button
                type="button"
                class="theme-toggle"
                :title="`主题：${THEME_LABELS[themeMode]}（点击切换）`"
                :aria-label="`主题：${THEME_LABELS[themeMode]}，点击切换`"
                @click="cycleThemeMode"
            >
                <svg v-if="themeMode === 'light'" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
                    <circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/>
                    <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                        <line x1="8" y1="1.1" x2="8" y2="2.8"/>
                        <line x1="8" y1="13.2" x2="8" y2="14.9"/>
                        <line x1="1.1" y1="8" x2="2.8" y2="8"/>
                        <line x1="13.2" y1="8" x2="14.9" y2="8"/>
                        <line x1="3.1" y1="3.1" x2="4.3" y2="4.3"/>
                        <line x1="11.7" y1="11.7" x2="12.9" y2="12.9"/>
                        <line x1="3.1" y1="12.9" x2="4.3" y2="11.7"/>
                        <line x1="11.7" y1="4.3" x2="12.9" y2="3.1"/>
                    </g>
                </svg>
                <svg v-else-if="themeMode === 'dark'" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
                    <path d="M13.6 9.9A5.7 5.7 0 0 1 6.1 2.4a6 6 0 1 0 7.5 7.5Z"
                          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                </svg>
                <svg v-else viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
                    <rect x="1.6" y="2.5" width="12.8" height="8.7" rx="1.4"
                          fill="none" stroke="currentColor" stroke-width="1.6"/>
                    <line x1="5.5" y1="13.7" x2="10.5" y2="13.7"
                          stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    </header>

    <!-- 主内容 -->
    <main class="main">
        <RouterView/>
    </main>

    <!-- 底部 -->
    <footer class="footer">
        <p>Powered by <a href="https://github.com/yafoo/menote" target="_blank" rel="noopener">MeNote</a></p>
    </footer>
</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '@/home/store/index.js';
import { flattenCates } from '@/home/utils/index.js';
import { THEME_LABELS, themeMode, cycleThemeMode, initTheme } from '@/shared/theme.js';

const router = useRouter();
const keyword = ref('');

// 导航里要连子分类一起列，所以得把分类树拍平（只渲染顶层的话二级分类看不到）。
// depth 是给模板判断要不要加"次级"样式用的
const navCates = computed(() => flattenCates(store.cates, true));

const doSearch = () => {
    router.push({path: '/search', query: {q: keyword.value}});
};

// 首屏配色由外壳里的内联脚本定好了（见 web/home.html），这里只对齐 JS 状态
// 并挂上"系统主题变化"的监听
initTheme();

onMounted(() => store.init());
</script>
