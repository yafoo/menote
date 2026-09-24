/**
 * 主题（浅色 / 暗黑 / 自适应）——服务端支持
 *
 * 要解决的问题：
 * 前台和后台都是 SPA，页面外壳（home.html / admin.html）里没有任何主题信息。
 * 如果等前端跑起来、调完 /api 拿到配置再套用主题，首屏必然先按默认浅色画一遍
 * 再跳成暗色——也就是俗称的"闪白"。
 *
 * 做法：外壳 HTML 里留一个 __MENOTE_THEME__ 占位符，控制器返回前替换成
 * 站点默认主题。这样外壳里那段首屏脚本（见 web/home.html、web/admin.html）
 * 在解析 <body> 之前就把 data-theme 定下来，浏览器第一帧就是正确颜色。
 *
 * 占位符没被替换的情况（Vite dev server 直出、产物被静态缓存等）不用特殊处理：
 * 前端脚本认不出这个值会退回 'auto'，功能不受影响，只是会闪一下。
 */

// 取值必须与 web/src/shared/theme.js 的 THEME_MODES 保持一致
const MODES = ['auto', 'light', 'dark'];
const PLACEHOLDER = '__MENOTE_THEME__';

// 主题是低频配置，但管理员改完必须立刻见效，所以缓存窗口压到 5 秒：
// 既省掉前台每次页面加载的一次配置查询，又不会出现"改了看不到效果"
const TTL = 5000;

let cache = {value: null, at: 0};

/**
 * 把任意输入收敛到三个合法值之一（非法一律当 auto）
 */
function normalize(value) {
    const v = String(value === undefined || value === null ? '' : value).trim();
    return MODES.indexOf(v) > -1 ? v : 'auto';
}

/**
 * 读站点默认主题（带 5 秒内存缓存）
 * @param {object} siteModel app/model/site.js 实例
 * @returns {Promise<string>} auto | light | dark
 */
async function getSiteTheme(siteModel) {
    const now = Date.now();
    if(cache.value !== null && now - cache.at < TTL) {
        return cache.value;
    }

    let value = 'auto';
    try {
        const config = await siteModel.getConfig();
        value = normalize(config.theme);
    } catch(e) {
        // 配置表读不到不该把整个页面外壳带崩，退回"自适应"（跟着系统走）
    }

    cache = {value, at: now};
    return value;
}

/**
 * 后台保存设置后调用，让下一个请求立刻读到新值
 */
function clearCache() {
    cache = {value: null, at: 0};
}

/**
 * 把外壳 HTML 里的占位符替换成主题值
 */
function inject(html, theme) {
    return html.split(PLACEHOLDER).join(normalize(theme));
}

module.exports = {MODES, PLACEHOLDER, normalize, getSiteTheme, clearCache, inject};
