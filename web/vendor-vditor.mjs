/**
 * 生成 Vditor 运行时资源目录（public/static/vendor/vditor）
 *
 * ── 为什么需要这个脚本 ────────────────────────────────────────────────
 * Vditor 与普通 npm 包不同：`import Vditor from 'vditor'` 只拿到编辑器本体
 * （package.json 的 main = dist/index.js，被 Vite 打进 admin.js），
 * 它在运行时仍会按 `options.cdn` 动态加载一批子资源。已从 dist/index.js
 * 与 dist/method.min.js 源码逐条核实，共 22 处 `${cdn}/dist/...` 拼接：
 *
 *   ${cdn}/dist/js/lute/lute.min.js            Markdown 引擎，必需
 *   ${cdn}/dist/js/icons/${icon}.js            工具栏图标，必需（同步 XHR）
 *   ${cdn}/dist/js/i18n/${lang}.js             语言包，必需
 *   ${cdn}/dist/index.css + method.min.js      预览 iframe 内使用，必需
 *   ${cdn}/dist/css/content-theme/*.css        内容主题
 *   ${cdn}/dist/images/emoji                   表情
 *   ${cdn}/dist/js/highlight.js/*              代码高亮
 *   ${cdn}/dist/js/{katex,mathjax,mermaid,...} 公式与图表，按需
 *
 * 所以这个目录无法省掉，但也不该再手工维护一份提交进 git 的副本。
 * 本脚本在构建时从 node_modules/vditor 生成，后台与前台共用同一份，
 * 输出目录已加入 .gitignore 与 docker/Dockerfile.dockerignore。
 *
 * ── 为什么不让 cdn 直接走官方默认的 https://unpkg.com/vditor@<版本> ──
 * MeNote 支持 P2P 直连与纯内网部署，一旦没有外网，lute（引擎）和 icons（图标）
 * 拉不到，编辑器直接不可用——这不是降级，是打不开。所以必须自托管。
 *
 * ── 复制范围 ──────────────────────────────────────────────────────────
 * 白名单式，只复制运行时真正会请求的文件。npm 包里的 dist 是 22.6M，其中三块
 * 是纯浪费，已剔除：
 *   1. dist/index.js / index.min.js / method.js（共 1.1M）
 *      index.js 已被 Vite 打进 bundle、index.min.js 无人引用、
 *      预览 iframe 引的是 method.min.js——这三份在 vendor 目录里永远不会被请求
 *   2. 同源多份的备选资源：11 种语言包只留 zh_CN、两套图标只留 ant、
 *      76 个代码主题只留 github 系（依据 NoteEditor.vue 配置与 Vditor 默认值）
 *   3. 低频图表渲染器，见下方 OPTIONAL 开关
 *
 * 用法：npm run build:vendor
 *      （已挂在 npm run build 前面，Dockerfile 的 web 阶段会自动执行）
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pkgPath = require.resolve('vditor/package.json');
const vditorRoot = dirname(pkgPath);
const version = require(pkgPath).version;

const src = join(vditorRoot, 'dist');
const destRoot = join(root, 'public', 'static', 'vendor', 'vditor');
const dest = join(destRoot, 'dist');
const stampFile = join(destRoot, '.version');

/* ────────────────────────────────────────────────────────────────────────
 * 1. 本项目实际用到的 Vditor 选项
 *    （NoteEditor.vue：lang='zh_CN'；icon / preview.hljs.style /
 *      preview.math.engine 均未配置，取 Vditor 默认值 ant / github / KaTeX）
 *    改这些值时下面的白名单要同步改，否则运行时 404
 * ──────────────────────────────────────────────────────────────────────── */
const LANG = 'zh_CN';
const ICON = 'ant';
const CODE_THEMES = ['github', 'github-dark', 'github-dark-dimmed'];
const CONTENT_THEMES = ['light', 'dark', 'ant-design', 'wechat'];

/** 必留：缺任何一项编辑器都会不可用或功能残缺 */
const REQUIRED = [
    'index.css',                                  // 预览 iframe 样式
    'method.min.js',                              // 预览 iframe 的渲染入口
    ...CONTENT_THEMES.map(t => `css/content-theme/${t}.css`),
    'images',                                     // emoji 雪碧图 + logo + loading
    'js/lute',                                    // Markdown 引擎（3.6M 单文件）
    'js/katex',                                   // 默认数学引擎（含字体 1.2M）
    'js/highlight.js/highlight.min.js',           // 代码高亮主体
    'js/highlight.js/third-languages.js',         // 高亮补充语言
    'js/highlight.js/LICENSE',
    ...CODE_THEMES.map(t => `js/highlight.js/styles/${t}.min.css`),
    `js/icons/${ICON}.js`,                        // 工具栏图标（同步 XHR 加载）
    `js/i18n/${LANG}.js`                          // 语言包
];

/**
 * 可选渲染器：只有笔记里写了对应语言的 ``` 代码块才会加载。
 * 关掉的后果仅限「该代码块回落成源码显示」+ 控制台一条加载失败，
 * 不影响编辑、保存、其他语法渲染。
 * 键名 → [目录, 体积 MB]
 */
const OPTIONAL = {
    mermaid:   ['js/mermaid', 3.50],
    graphviz:  ['js/graphviz', 2.00],
    echarts:   ['js/echarts', 1.00],
    markmap:   ['js/markmap', 0.82],
    abcjs:     ['js/abcjs', 0.35],
    smiles:    ['js/smiles-drawer', 0.24],
    flowchart: ['js/flowchart.js', 0.12],
    wavedrom:  ['js/wavedrom', 0.09],
    plantuml:  ['js/plantuml', 0.03],
    mathjax:   ['js/mathjax', 6.50]
};

/**
 * 默认只开 mermaid（最常用的图表）。
 *   只开 mermaid      → 约 10M
 *   全开              → 约 21M
 *   连 mermaid 也关掉 → 约 6.5M
 */
const ENABLED_OPTIONAL = ['mermaid'];

const keepList = [...REQUIRED, ...ENABLED_OPTIONAL.map(k => OPTIONAL[k][0])];
const disabled = Object.entries(OPTIONAL)
    .filter(([k]) => !ENABLED_OPTIONAL.includes(k))
    .map(([k, [dir, mb]]) => ({key: k, dir, mb}));

/* ────────────────────────────────────────────────────────────────────────
 * 2. 版本戳（含白名单指纹）
 *    白名单一变就必须重拷，否则会出现「改了配置但产物还是旧的」这种最难查的 bug
 * ──────────────────────────────────────────────────────────────────────── */
const fingerprint = crypto.createHash('sha1')
    .update(version + '|' + keepList.join(','))
    .digest('hex').slice(0, 12);
const stamp = `${version}+${fingerprint}`;

const prevStamp = await fs.readFile(stampFile, 'utf8').catch(() => '');
if(prevStamp.trim() === stamp && await fs.stat(dest).catch(() => null)) {
    console.log(`[vendor] vditor ${version} (${fingerprint}) 已就绪，跳过`);
    await report();
    process.exit(0);
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. 按白名单复制
 * ──────────────────────────────────────────────────────────────────────── */
await fs.rm(destRoot, {recursive: true, force: true});
await fs.mkdir(destRoot, {recursive: true});

const absent = [];
for(const rel of keepList) {
    const from = join(src, rel);
    const to = join(dest, rel);
    const st = await fs.stat(from).catch(() => null);
    if(!st) {
        absent.push(rel);
        continue;
    }
    await fs.mkdir(dirname(to), {recursive: true});
    await fs.cp(from, to, {recursive: true});
}
if(absent.length) {
    console.error('[vendor] ✗ 白名单里的以下条目在 vditor 包里不存在，请修正 REQUIRED / OPTIONAL：');
    absent.forEach(a => console.error('        ' + a));
    process.exit(1);
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. 自检：把 vditor 源码里所有 ${cdn}/dist/... 请求挖出来，逐条核对是否已复制
 *    这一步是为了拦住「白名单漏项」——那种问题只在用户写特定语法时才暴露，
 *    光看「构建成功」完全看不出来
 * ──────────────────────────────────────────────────────────────────────── */
const PLACEHOLDER = {lang: LANG, icon: ICON, style: 'github', codeTheme: 'github', theme: 'light'};

const referenced = new Set();
for(const f of ['index.js', 'method.min.js']) {
    const code = await fs.readFile(join(src, f), 'utf8');
    for(const m of code.matchAll(/["'`]([^"'`]*\/dist\/[^"'`]*)["'`]/g)) {
        const raw = m[1];
        // 跳过绝对 URL。Vditor 的「关于」面板硬编码了
        // https://unpkg.com/vditor/dist/images/logo.png，它不受 cdn 选项影响，
        // 也改不了——只能记一笔：纯离线环境下这个面板里的 logo 是裂图
        if(raw.includes('://')) continue;
        // 去掉查询串（如 katex.min.js?v=0.16.9）与首尾斜杠，再剥掉 dist/ 前缀。
        // 反斜杠必须一并归一：vditor 源码里有 ".../dist/index.css\"/>" 这种
        // 转义引号的写法，上面的正则不认 JS 转义，会把转义用的那个 \ 一起吞进来
        // —— rel 于是变成 "index.css\"。
        //    Windows：结尾的 \ 被当成路径分隔符默默吃掉，stat 照样成功 →
        //             本地构建永远"通过"，坑被完全掩盖
        //    Linux：  \ 是字面字符，dist/index.css\ 不存在 → 被判 missing →
        //             CI/Docker 直接 exit 1
        // 所以这里统一把 \ 当分隔符转成 /，两种平台行为就一致了
        const rel = raw.split('?')[0]
            .replace(/\\/g, '/')
            .replace(/^\/+|\/+$/g, '')
            .replace(/^dist\//, '');
        if(!rel) continue;
        referenced.add(rel.replace(/\$\{(\w+)\}/g, (_, k) => PLACEHOLDER[k] ?? `\u0000${k}`));
    }
}

const problems = [];
const trimmedHits = new Set();
for(const rel of referenced) {
    if(rel.includes('\u0000')) continue;                        // 占位符未知，跳过
    if(await fs.stat(join(dest, rel)).catch(() => null)) continue;
    const hit = disabled.find(d => rel === d.dir || rel.startsWith(d.dir + '/'));
    if(hit) trimmedHits.add(hit.key);
    else problems.push(rel);
}

console.log(`[vendor] vditor ${version} → public/static/vendor/vditor  (${fingerprint})`);
if(trimmedHits.size) {
    console.log(`[vendor] 已按配置裁剪：${[...trimmedHits].sort().join('、')}`);
}
if(problems.length) {
    console.error('[vendor] ✗ 以下资源运行时会被请求，但白名单里没有，会导致该语法渲染失败：');
    problems.forEach(p => console.error('        ' + p));
    console.error('        修法：加进 REQUIRED，或把对应渲染器加进 ENABLED_OPTIONAL');
    process.exit(1);
}
// 版本戳必须等自检通过后再落盘：否则自检失败时下次会命中戳直接跳过，
// 把问题永久掩盖掉
await fs.writeFile(stampFile, stamp);
console.log('[vendor] ✓ 自检通过：源码引用的资源全部就位');
await report();

async function dirSize(p) {
    const st = await fs.stat(p).catch(() => null);
    if(!st) return 0;
    if(!st.isDirectory()) return st.size;
    let total = 0;
    for(const e of await fs.readdir(p, {withFileTypes: true})) {
        total += await dirSize(join(p, e.name));
    }
    return total;
}

async function report() {
    const mb = (await dirSize(dest) / 1024 / 1024).toFixed(1);
    console.log(`[vendor] 当前体积 ${mb} MB`);
    if(disabled.length) {
        console.log(`[vendor] 已裁掉的可选渲染器（想恢复就把键名加进 ENABLED_OPTIONAL）：`);
        for(const d of disabled) {
            console.log(`[vendor]   ${d.key.padEnd(10)} ${d.dir.padEnd(20)} 约 ${d.mb} MB`);
        }
    } else {
        console.log('[vendor] 可选渲染器全部启用');
    }
}
