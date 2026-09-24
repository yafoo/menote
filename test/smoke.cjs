/**
 * 前台 SPA 冒烟测试
 *
 * 目的：验证「构建产物」在真实浏览器里能跑起来——不是验证源码语法。
 * 后台那套 CDP 测试需要 mock 登录态与接口，本文件刻意只覆盖**公开、无副作用、
 * 数据可预期**的部分，所以能在任何有数据的实例上直接跑。
 *
 * 覆盖三件事：
 *   1. 服务端兜底：/、/note/:id.html、/cate/:id、/search、/graph 都返回 SPA 外壳
 *      （history 路由下，直接访问/刷新这些 URL 走的是服务端路由，缺一条就 404）
 *   2. 静态资源可达：外壳里引用的 js/css、以及 Vditor 运行时资源（cdn 同源要求）
 *   3. 浏览器渲染：5 条路由的 DOM 真的渲染出来（Markdown 已过 Vditor.preview、
 *      图谱 canvas 已创建、异常页给出提示文案）
 *
 * 用法：
 *   npm run dev            # 另开一个终端，先把服务跑起来（3107）
 *   node test/smoke.cjs
 *
 * 依赖本机 Edge（Windows 自带）。判据说明：生产构建里 Vue 不会输出
 * "Failed to resolve component" 警告（dev-only），未注册的组件会以原生自定义元素
 * 原样留在 DOM 里，所以「DOM 里还有 el- 或 router- 前缀的标签」== 组件没解析。
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const EDGE_CANDIDATES = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const PORT = 9334;
const ORIGIN = process.env.MENOTE_ORIGIN || 'http://127.0.0.1:3107';
const PROFILE = path.join(__dirname, '.tmp-smoke-profile');

// ── 用例 ──────────────────────────────────────────────────────────────
// expect: 必须存在的选择器；check: 自定义断言（返回 {ok, detail}）
// 详情/分类两条用例的 id 在运行时用真实数据填充（见 main），避免写死 ID 后
// 换个实例就红——测试要能跑在任何有数据的部署上。
const ROUTES = [
    {
        url: '/', name: '首页',
        expect: ['.page-home', '.note-list .note-item', '.header .nav', '.search-form'],
        check: `(() => {
            const items = document.querySelectorAll('.page-home .note-item').length;
            const navLinks = document.querySelectorAll('.header .nav a').length;
            return {ok: items > 0 && navLinks > 0, detail: '列表 ' + items + ' 条 / 导航 ' + navLinks + ' 个'};
        })()`
    },
    {
        url: null, name: '笔记详情',   // 运行时填 /note/<id>.html
        expect: ['.page-note', '.note-header h1', '.note-content'],
        check: `(() => {
            const h = document.querySelector('.note-header h1').textContent.trim();
            const body = document.querySelector('.note-content').innerHTML;
            // Vditor.preview 渲染后应当有真实标签，而不是原始 Markdown 文本
            const rendered = body.includes('<h1') || body.includes('<p');
            return {ok: rendered, detail: '标题="' + h + '" 正文 ' + body.length + ' 字节, 已渲染=' + rendered};
        })()`
    },
    {
        url: null, name: '分类页',     // 运行时填 /cate/<id>
        expect: ['.page-cate', '.cate-header h1', '.note-list .note-item'],
        check: `(() => {
            const h = document.querySelector('.cate-header h1').textContent.trim();
            const desc = document.querySelector('.cate-desc').textContent.trim();
            return {ok: !!h, detail: '分类="' + h + '" ' + desc};
        })()`
    },
    {
        url: null, name: '搜索页',     // 运行时填 /search?q=<真实关键词>
        expect: ['.page-search', '.search-header', '.note-list .note-item'],
        check: `(() => {
            const q = document.querySelector('.search-query strong');
            const n = document.querySelectorAll('.page-search .note-item').length;
            return {ok: !!q && n > 0, detail: '关键词="' + (q ? q.textContent.trim() : '(无)') + '" 命中 ' + n + ' 条'};
        })()`
    },
    {
        url: '/note/99999.html', name: '不存在的笔记',
        expect: ['.page-note .empty'],
        check: `(() => {
            const t = document.querySelector('.page-note .empty').textContent.trim();
            return {ok: t.includes('不存在') || t.includes('未公开'), detail: '提示="' + t + '"'};
        })()`
    },
    {
        url: '/cate/9999', name: '不存在的分类',
        expect: ['.page-cate .empty'],
        check: `(() => {
            const t = document.querySelector('.page-cate .empty').textContent.trim();
            return {ok: t.includes('不存在') || t.includes('未公开'), detail: '提示="' + t + '"'};
        })()`
    },
    {
        url: '/graph', name: '知识图谱',
        expect: ['.graph-network', '.graph-info'],
        check: `(() => {
            const canvas = document.querySelectorAll('.graph-network canvas').length;
            const info = document.querySelector('.graph-info').textContent.replace(/\\s+/g, ' ').trim();
            return {ok: canvas > 0, detail: 'canvas=' + canvas + ' | ' + info};
        })()`
    }
];

// Vditor 运行时资源：icons 走**同步 XHR**，所以 cdn 必须同源；这几条挂了编辑器就废
const VENDOR_ASSETS = [
    '/static/vendor/vditor/dist/js/lute/lute.min.js',
    '/static/vendor/vditor/dist/js/icons/ant.js',
    '/static/vendor/vditor/dist/js/i18n/zh_CN.js',
    '/static/vendor/vditor/dist/css/content-theme/light.css',
    '/static/vendor/vditor/dist/js/highlight.js/styles/github.min.css',
    '/static/vendor/vditor/dist/index.css',
    '/static/vendor/vditor/dist/method.min.js'
];

// ── 最小 CDP 客户端 ──────────────────────────────────────────────────
class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.handlers = new Map();
        ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if(msg.id && this.pending.has(msg.id)) {
                const {resolve, reject} = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
            } else if(msg.method) {
                (this.handlers.get(msg.method) || []).forEach(fn => fn(msg.params));
            }
        });
    }
    on(method, fn) {
        if(!this.handlers.has(method)) this.handlers.set(method, []);
        this.handlers.get(method).push(fn);
    }
    send(method, params = {}) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({id, method, params}));
        return new Promise((resolve, reject) => this.pending.set(id, {resolve, reject}));
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL  ' + msg); };
const pass = (msg) => console.log('PASS  ' + msg);

(async () => {
    // ── 前置：服务在跑吗 ────────────────────────────────────────────
    try {
        const res = await fetch(ORIGIN + '/');
        if(res.status !== 200) throw new Error('HTTP ' + res.status);
    } catch(e) {
        console.error(`服务不可达：${ORIGIN}（${e.message}）\n先执行 npm run dev 或 npm start，再跑本脚本。`);
        process.exit(2);
    }

    // ── 前置：取真实公开数据，填充详情/分类用例的 id ─────────────────
    const apiGet = async (p) => {
        const res = await fetch(ORIGIN + '/api/pub/' + p, {headers: {'X-Requested-With': 'XMLHttpRequest'}});
        return res.json();
    };
    const notesRes = await apiGet('notes?rows=1');
    const cfgRes = await apiGet('config');
    const realNoteId = notesRes?.data?.list?.[0]?.id;
    const realCateId = cfgRes?.data?.cates?.[0]?.id;

    if(!realNoteId || !realCateId) {
        console.error('实例里没有公开笔记/分类，无法验证详情页与分类页。请先在后台把某个分类设为公开。');
        process.exit(2);
    }
    ROUTES.find(r => r.name === '笔记详情').url = `/note/${realNoteId}.html`;
    ROUTES.find(r => r.name === '分类页').url = `/cate/${realCateId}`;

    // 搜索关键词同样从真实数据派生：优先用第一个标签，没有标签就取标题前 2 个字
    const noteRes = await apiGet('note?id=' + realNoteId);
    const note = noteRes?.data || {};
    const keyword = String(note.keywords || '').split(',')[0].trim() || String(note.title || '').slice(0, 2);
    if(!keyword) {
        console.error(`笔记 #${realNoteId} 既无标签也无标题，无法验证搜索页。`);
        process.exit(2);
    }
    ROUTES.find(r => r.name === '搜索页').url = '/search?q=' + encodeURIComponent(keyword);
    console.log(`（取到公开数据：笔记 #${realNoteId}、分类 #${realCateId}、搜索词「${keyword}」）\n`);

    // ── 1. 服务端兜底 + 外壳引用 ────────────────────────────────────
    console.log('── 1. 服务端路由兜底 ──');
    for(const r of ROUTES) {
        const res = await fetch(ORIGIN + r.url);
        const html = await res.text();
        const isShell = /assets\/home\.[\w-]+\.js/.test(html);
        if(res.status === 200 && isShell) {
            pass(`${r.url.padEnd(28)} HTTP 200 返回 SPA 外壳`);
        } else {
            fail(`${r.url.padEnd(28)} HTTP ${res.status} 未返回 SPA 外壳（构建产物缺失？）`);
        }
    }

    // ── 2. 静态资源可达 ────────────────────────────────────────────
    console.log('\n── 2. 静态资源可达 ──');
    const shell = await (await fetch(ORIGIN + '/')).text();
    const refs = [...shell.matchAll(/(?:src|href)="(\/static\/dist\/[^"]+)"/g)].map(m => m[1]);
    for(const ref of refs) {
        const res = await fetch(ORIGIN + ref);
        res.status === 200 ? pass(`200  ${ref}`) : fail(`${res.status}  ${ref}`);
    }
    for(const ref of VENDOR_ASSETS) {
        const res = await fetch(ORIGIN + ref);
        res.status === 200 ? pass(`200  ${ref}`) : fail(`${res.status}  ${ref}  ← Vditor 运行时资源缺失`);
    }

    // ── 3. 浏览器渲染 ──────────────────────────────────────────────
    const edgePath = EDGE_CANDIDATES.find(p => fs.existsSync(p));
    if(!edgePath) {
        console.log('\n跳过浏览器渲染测试：未找到 Edge/Chrome');
        console.log(`\n结果：${failures ? failures + ' 项失败' : '全部通过'}`);
        process.exit(failures ? 1 : 0);
    }

    console.log('\n── 3. 浏览器渲染 ──');
    fs.rmSync(PROFILE, {recursive: true, force: true});
    const browser = spawn(edgePath, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--mute-audio',
        `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'
    ], {stdio: 'ignore'});

    let target = null;
    for(let i = 0; i < 60 && !target; i++) {
        await sleep(250);
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            target = list.find(t => t.type === 'page');
        } catch(e) { /* 还没起来 */ }
    }
    if(!target) throw new Error('浏览器 CDP 未就绪');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const cdp = new CDP(ws);

    let consoleErrors = [];
    let exceptions = [];
    const badResponses = [];
    cdp.on('Runtime.consoleAPICalled', (p) => {
        if(p.type === 'error') consoleErrors.push((p.args || []).map(a => a.value ?? a.description ?? '').join(' '));
    });
    cdp.on('Runtime.exceptionThrown', (p) => exceptions.push(p.exceptionDetails.text + ' ' + (p.exceptionDetails.exception?.description || '')));
    cdp.on('Network.responseReceived', (p) => {
        if(p.response.status >= 400) badResponses.push(`HTTP ${p.response.status} ${p.response.url}`);
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const evaluate = async (expr) => {
        const r = await cdp.send('Runtime.evaluate', {expression: expr, returnByValue: true, awaitPromise: true});
        if(r.exceptionDetails) throw new Error(r.exceptionDetails.text);
        return r.result.value;
    };

    for(const r of ROUTES) {
        consoleErrors = [];
        exceptions = [];
        const before = badResponses.length;

        await cdp.send('Page.navigate', {url: ORIGIN + r.url});
        // 笔记详情要等 Vditor 动态 import + preview 渲染完
        await sleep(r.url.includes('/note/') ? 4000 : 2200);

        const probe = await evaluate(`(() => {
            const unresolved = [...new Set([...document.querySelectorAll('*')]
                .filter(el => /^(el|router|view)-/.test(el.tagName.toLowerCase()))
                .map(el => el.tagName.toLowerCase()))];
            const missing = ${JSON.stringify(r.expect)}.filter(s => !document.querySelector(s));
            return {unresolved, missing, appLen: (document.getElementById('app') || {}).innerHTML?.length || 0, custom: ${r.check}};
        })()`);

        const bad = badResponses.slice(before);
        const ok = probe.unresolved.length === 0 && probe.missing.length === 0 && probe.custom.ok
            && consoleErrors.length === 0 && exceptions.length === 0 && bad.length === 0;
        if(ok) {
            pass(`${r.url.padEnd(28)} ${r.name}  ${probe.custom.detail}  [DOM ${probe.appLen} 字节]`);
        } else {
            fail(`${r.url.padEnd(28)} ${r.name}`);
            if(!probe.custom.ok) console.log(`        ✗ 断言未过: ${probe.custom.detail}`);
            if(probe.unresolved.length) console.log(`        ✗ 未解析组件: ${probe.unresolved.join(', ')}`);
            if(probe.missing.length) console.log(`        ✗ 缺失选择器: ${probe.missing.join(', ')}`);
            if(consoleErrors.length) console.log(`        ✗ 控制台错误: ${consoleErrors.join(' | ')}`);
            if(exceptions.length) console.log(`        ✗ 未捕获异常: ${exceptions.join(' | ')}`);
            if(bad.length) console.log(`        ✗ 请求失败: ${[...new Set(bad)].join(' | ')}`);
        }
    }

    // ── 4. 刷新兜底：history 路由下原地 reload 必须还能渲染 ──────────
    const noteUrl = `/note/${realNoteId}.html`;
    console.log(`\n── 4. 刷新兜底（${noteUrl} 原地 reload）──`);
    await cdp.send('Page.navigate', {url: ORIGIN + noteUrl});
    await sleep(4000);
    await cdp.send('Page.reload', {ignoreCache: true});
    await sleep(4000);
    const rp = await evaluate(`(() => ({
        title: document.querySelector('.note-header h1')?.textContent.trim() || '',
        bodyLen: document.querySelector('.note-content')?.innerHTML.length || 0
    }))()`);
    rp.title && rp.bodyLen > 0
        ? pass(`刷新后正常渲染：标题="${rp.title}" 正文 ${rp.bodyLen} 字节`)
        : fail(`刷新后渲染失败：标题="${rp.title}" 正文 ${rp.bodyLen} 字节`);

    // ── 5. 交互：头部搜索框提交 ──────────────────────────────────────
    // 这条是给"改头部搜索按钮"这类改动兜底的——按钮换成内联 SVG 后依然
    // 必须是 form 里的 submit 按钮，否则回车/点击都不会触发搜索
    console.log('\n── 5. 交互（头部搜索框）──');
    await cdp.send('Page.navigate', {url: ORIGIN + '/'});
    await sleep(2200);
    const submitProbe = await evaluate(`(() => {
        const form = document.querySelector('.search-form');
        if(!form) return {error: '找不到 .search-form'};
        const input = form.querySelector('input');
        const btn = form.querySelector('button[type="submit"]');
        if(!btn) return {error: 'form 里没有 type=submit 的按钮'};
        // v-model 监听的是 input 事件，直接赋 .value 不会触发，得手动派发
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(keyword)});
        input.dispatchEvent(new Event('input', {bubbles: true}));
        form.requestSubmit ? form.requestSubmit(btn) : btn.click();
        return {ok: true};
    })()`);

    if(submitProbe.error) {
        fail('搜索框提交：' + submitProbe.error);
    } else {
        await sleep(2400);
        const after = await evaluate(`(() => ({
            href: location.href,
            q: document.querySelector('.search-query strong')?.textContent.trim() || '',
            count: document.querySelectorAll('.page-search .note-item').length
        }))()`);
        const hit = decodeURIComponent(after.href).includes('q=' + keyword) && after.q === keyword && after.count > 0;
        hit
            ? pass(`提交「${keyword}」→ ${after.href.replace(ORIGIN, '')}，命中 ${after.count} 条`)
            : fail(`提交「${keyword}」后跳转异常：href="${after.href}" 关键词="${after.q}" 命中 ${after.count} 条`);
    }

    ws.close();
    browser.kill();
    await sleep(500);
    fs.rmSync(PROFILE, {recursive: true, force: true});

    console.log(`\n结果：${failures ? failures + ' 项失败' : '全部通过'}`);
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error('脚本失败:', e); process.exit(2); });
