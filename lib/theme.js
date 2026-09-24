/**
 * 页面外壳注入（主题 + 站点名）——服务端支持
 *
 * 要解决的问题：
 * 前台和后台都是 SPA，页面外壳（home.html / admin.html）本身不含任何站点信息。
 * 如果等前端跑起来、调完 /api 拿到配置再套用，首屏必然先按默认浅色画一遍
 * 再跳成暗色——也就是俗称的"闪白"；<title> 同理，会先显示兜底名再跳成站点名。
 *
 * 做法：外壳 HTML 里留两个占位符，控制器返回前替换掉：
 *   __MENOTE_THEME__     站点默认主题，首屏脚本用它定 data-theme
 *   __MENOTE_SITENAME__  站点名，用在 <title> 里
 * 这样外壳里那段首屏脚本在解析 <body> 之前就把 data-theme 定下来，浏览器第一帧
 * 就是正确颜色；<title> 也一次到位，不用等 /api/pub/config 回来。
 *
 * 占位符没被替换的情况（Vite dev server 直出、产物被静态缓存等）不用特殊处理：
 * 主题值认不出会退回 'auto'，站点名由外壳里的首屏脚本兜底（见 web/home.html）。
 */

// 取值必须与 web/src/shared/theme.js 的 THEME_MODES 保持一致
const MODES = ['auto', 'light', 'dark'];
const PLACEHOLDER = '__MENOTE_THEME__';
const SITENAME_PLACEHOLDER = '__MENOTE_SITENAME__';
// 站点名没配（或占位符没被替换）时的兜底值，与外壳首屏脚本里的那份一致
const FALLBACK_SITENAME = 'MeNote';

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
 * 站点名会拼进 <title>，而管理员可以自由填写，必须转义后再注入
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 读外壳需要的站点配置（主题 + 站点名），带 5 秒内存缓存。
 * 两个值来自同一次 getConfig()，所以合成一个函数——分两次读会白查一次库。
 * @param {object} siteModel app/model/site.js 实例
 * @returns {Promise<{theme: string, sitename: string}>}
 */
async function getShellVars(siteModel) {
    const now = Date.now();
    if(cache.value !== null && now - cache.at < TTL) {
        return cache.value;
    }

    // 读不到配置不该把整个页面外壳带崩：退回"自适应" + 兜底站点名
    let value = {theme: 'auto', sitename: ''};
    try {
        const config = await siteModel.getConfig();
        value = {
            theme: normalize(config.theme),
            sitename: String(config.sitename === undefined || config.sitename === null ? '' : config.sitename).trim()
        };
    } catch(e) {
        // 静默降级，见上
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
 * 把外壳 HTML 里的占位符替换成实际值
 * @param {string} html 外壳 HTML
 * @param {{theme?: string, sitename?: string}} vars getShellVars() 的返回值
 * @returns {string}
 */
function inject(html, vars) {
    const theme = normalize(vars && vars.theme);
    const sitename = vars && vars.sitename ? String(vars.sitename).trim() : '';
    return html
        .split(PLACEHOLDER).join(theme)
        .split(SITENAME_PLACEHOLDER).join(escapeHtml(sitename || FALLBACK_SITENAME));
}

module.exports = {
    MODES, PLACEHOLDER, SITENAME_PLACEHOLDER, FALLBACK_SITENAME,
    normalize, escapeHtml, getShellVars, clearCache, inject
};
