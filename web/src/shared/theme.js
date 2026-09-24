/**
 * 主题（浅色 / 暗黑 / 自适应）—— 前台与后台共用
 *
 * ── 三个概念，别混 ────────────────────────────────────────────────────
 *   mode     用户/站点的"意图"：auto（跟随系统）| light | dark
 *   resolved mode 解析后的实际结果：light | dark。auto 看系统
 *   data-theme  写在 <html> 上的属性，值是 resolved。**CSS 只认它**
 *
 * ── 为什么用 <html> 属性而不是 CSS 媒体查询做"自适应" ────────────────
 * 纯 `@media (prefers-color-scheme: dark)` 能做到零 JS 自适应，但"用户在
 * 页面上手动选浅色、系统却是暗色"这一种组合会失效——媒体查询管不了"用户
 * 偏好优先于系统"。用属性的话，浅/暗两套令牌各写一遍即可，而且 Element Plus
 * 的暗色主题本来就认 `html.dark` 这个类，顺带一起管了。
 *
 * 首屏不闪白由外壳 HTML 里的内联脚本负责（web/home.html、web/admin.html），
 * 它在 <body> 解析前就把 data-theme 写好；这里只负责后续的交互与持久化。
 *
 * ── 优先级 ────────────────────────────────────────────────────────────
 *   localStorage（本机手动选择） > 站点默认（后台"站点设置"） > auto
 */
import { ref } from 'vue';

const KEY = 'menote-theme';

// 与 lib/theme.js 的 MODES 保持一致
export const THEME_MODES = ['auto', 'light', 'dark'];
export const THEME_LABELS = {auto: '自适应', light: '浅色', dark: '暗黑'};

// 各主题下的浏览器地址栏配色（与 home.css 的 --bg 一致）
const BAR_COLOR = {light: '#ffffff', dark: '#0f1716'};

export const isThemeMode = (v) => THEME_MODES.indexOf(v) > -1;

/** 系统当前偏好 */
export const systemTheme = () => {
    if(typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** 本机手动选择（没选过返回 null，不要用 auto 顶替，两者语义不同） */
export const readStoredMode = () => {
    try {
        const v = localStorage.getItem(KEY);
        return isThemeMode(v) ? v : null;
    } catch(e) {
        // 隐私模式 / 禁用存储：当作没选过
        return null;
    }
};

const writeStoredMode = (mode) => {
    try {
        if(isThemeMode(mode)) {
            localStorage.setItem(KEY, mode);
        } else {
            localStorage.removeItem(KEY);
        }
    } catch(e) {}
};

/** 当前模式（auto | light | dark），供切换按钮展示用 */
export const themeMode = ref('auto');
/** 当前实际生效的主题（light | dark） */
export const resolvedTheme = ref('light');

/**
 * 套用主题：写 <html> 属性 + 同步地址栏配色
 * @param {string} mode auto | light | dark
 * @param {object} [opts]
 * @param {boolean} [opts.silent] 只画不改状态：不动 themeMode/resolvedTheme，
 *   调用方负责后续同步。用于"预览"场景（后台设置页改主题想立刻看到效果，
 *   但不想让头部切换按钮跟着变、更不想写 localStorage）
 * @returns {string} 实际生效的 light | dark
 */
export const applyTheme = (mode, opts = {}) => {
    if(!isThemeMode(mode)) mode = 'auto';
    const resolved = mode === 'auto' ? systemTheme() : mode;
    const el = document.documentElement;

    el.setAttribute('data-theme', resolved);
    el.setAttribute('data-theme-mode', mode);
    // Element Plus 的暗色变量挂在 html.dark 下（theme-chalk/dark/css-vars.css）
    el.classList.toggle('dark', resolved === 'dark');

    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', BAR_COLOR[resolved]);

    if(!opts.silent) {
        themeMode.value = mode;
        resolvedTheme.value = resolved;
    }
    return resolved;
};

/**
 * 只预览不落地：见 applyTheme 的 silent 参数
 */
export const previewTheme = (mode) => applyTheme(mode, {silent: true});

/** 用户手动切换（写 localStorage，从此不再跟随站点默认） */
export const setThemeMode = (mode) => {
    writeStoredMode(mode);
    applyTheme(mode);
};

/** 依次轮换 auto → light → dark → auto */
export const cycleThemeMode = () => {
    const i = THEME_MODES.indexOf(themeMode.value);
    setThemeMode(THEME_MODES[(i + 1) % THEME_MODES.length]);
};

/**
 * 站点默认主题到手后同步一次。
 * 只在本机没手动选过时生效——用户的显式选择永远优先于站点设置
 * @param {string} mode 后台"站点设置"里的 theme
 */
export const syncFromSite = (mode) => {
    if(!readStoredMode() && isThemeMode(mode)) applyTheme(mode);
};

let mediaBound = false;

/**
 * 初始化。外壳里的内联脚本已经定过色了，这里只是把 JS 侧状态对齐，
 * 并挂上系统主题变化的监听（自适应模式下，系统日落切暗色，页面要跟上）
 */
export const initTheme = () => {
    const el = document.documentElement;
    const boot = el.getAttribute('data-theme-mode');
    applyTheme(isThemeMode(boot) ? boot : (readStoredMode() || 'auto'));

    if(mediaBound || typeof window === 'undefined' || !window.matchMedia) return;
    mediaBound = true;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
        if(themeMode.value === 'auto') applyTheme('auto');
    };
    // Safari 14 以前只有 addListener，加个兜底不影响新浏览器
    if(mq.addEventListener) mq.addEventListener('change', onChange);
    else if(mq.addListener) mq.addListener(onChange);
};
