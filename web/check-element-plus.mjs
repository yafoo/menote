/**
 * Element Plus 按需引入一致性自检
 *
 * 为什么需要它：
 * 后台的 Element Plus 是**按需引入**的，新增一个组件要同时改 main.js 的三处：
 *   1. `import { ElXxx } from 'element-plus'`                        —— 漏了 → 模板里是未知标签，静默不渲染
 *   2. `COMPONENTS` 对象                                             —— 漏了 → 同上
 *   3. `import 'element-plus/es/components/<kebab>/style/css'`       —— 漏了 → 组件能渲染但**没有样式**（裸 HTML）
 * 生产构建下 Vue **不会**输出 "Failed to resolve component" 警告（dev-only），
 * 所以这三类错误都不会在构建期或运行期报错，只会在页面上表现为"这块空白/没样式"。
 *
 * 这个脚本把三处清单和**模板里真实出现的 `el-*` 标签**做双向比对，构建前拦下来。
 * 顺便查图标注册（`@element-plus/icons-vue`）——它的失败模式一模一样。
 *
 * 用法：node web/check-element-plus.mjs   （已接进 npm run build，失败即中断构建）
 *      node web/check-element-plus.mjs --warn-only   只看报告，不因 ERROR 退出 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_SRC = path.join(root, 'src', 'admin');
const MAIN_JS = path.join(ADMIN_SRC, 'main.js');
const EP_DIR = path.join(root, '..', 'node_modules', 'element-plus', 'es', 'components');
const warnOnly = process.argv.includes('--warn-only');

// 这三个是**插件/服务**，不是模板组件：只用 style import，不进 COMPONENTS
const PLUGINS = ['ElLoading', 'ElMessage', 'ElMessageBox'];
// 模板里合法出现、但不归本脚本管的 PascalCase 标签（本地组件 / 路由组件 / 内置组件）
const TAG_ALLOWLIST = new Set([
    'CategoryTree', 'NoteList', 'NoteEditor', 'GraphCanvas',
    'RouterLink', 'RouterView',
    'Suspense', 'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport'
]);

const read = (p) => fs.readFileSync(p, 'utf8');

/**
 * 去掉 JS 注释，但**保留字符串字面量**里的内容。
 * 必须做这一步：main.js 顶部的使用说明注释里就写着
 * `import {...} from 'element-plus'` 和 `.../components/<name>/style/css` 的示例，
 * 不剥注释的话正则先命中注释，解析出来的清单全是垃圾。
 * 块注释里的换行会保留，这样报错行号还有参考价值。
 */
const stripComments = (src) => {
    let out = '';
    let state = 'code'; // code | line | block | single | double | template
    for(let i = 0; i < src.length; i++) {
        const c = src[i], d = src[i + 1];
        if(state === 'code') {
            if(c === '/' && d === '/') { state = 'line'; i++; continue; }
            if(c === '/' && d === '*') { state = 'block'; i++; continue; }
            if(c === "'") state = 'single';
            else if(c === '"') state = 'double';
            else if(c === '`') state = 'template';
            out += c;
            continue;
        }
        if(state === 'line') {
            if(c === '\n') { state = 'code'; out += c; }
            continue;
        }
        if(state === 'block') {
            if(c === '*' && d === '/') { state = 'code'; i++; continue; }
            if(c === '\n') out += c;
            continue;
        }
        // 字符串内部：处理转义，遇到配对的引号才回到 code
        if(c === '\\') { out += c + (d ?? ''); i++; continue; }
        if((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) {
            state = 'code';
        }
        out += c;
    }
    return out;
};

/** ElCheckboxGroup → el-checkbox-group（模板里写的形式） */
const toTag = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
/** ElCheckboxGroup → checkbox-group（EP 的 style 目录名，**不带 el- 前缀**） */
const toStyleDir = (name) => toTag(name.replace(/^El(?=[A-Z])/, ''));

// ── 1. 从 main.js 抽出三份清单 ─────────────────────────────────────────
const mainSrc = stripComments(read(MAIN_JS));

// 捕获用 [^}]* 而不是 [\s\S]*?：前者无法跨越 `}`，所以不会从更早的
// `import { createApp } from 'vue'` 一路吃到 element-plus 那个块的收尾括号
const importBlock = mainSrc.match(/import\s*\{([^}]*)\}\s*from\s*['"]element-plus['"]/);
const imported = importBlock
    ? importBlock[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
    : [];

const compBlock = mainSrc.match(/const\s+COMPONENTS\s*=\s*\{([\s\S]*?)\}/);
const registered = compBlock
    ? compBlock[1].split(',').map(s => s.trim()).filter(Boolean)
    : [];

const styleImports = [...mainSrc.matchAll(/element-plus\/es\/components\/([a-z0-9-]+)\/style\/css/g)]
    .map(m => m[1]);

const iconBlock = mainSrc.match(/const\s+ICONS\s*=\s*\{([\s\S]*?)\}/);
const icons = iconBlock
    ? iconBlock[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean)
    : [];

if(!importBlock || !compBlock || !iconBlock) {
    console.error('✗ 无法从 main.js 解析出清单（import / COMPONENTS / ICONS 的结构变了？）');
    process.exit(1);
}

// ── 2. 扫描所有 .vue 的模板部分 ────────────────────────────────────────
const vueFiles = [];
(function walk(dir) {
    for(const e of fs.readdirSync(dir, { withFileTypes: true })) {
        // 跳过 . 开头的临时草稿（本项目临时脚本一律 .tmp- 前缀），免得误报
        if(e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if(e.isDirectory()) walk(p);
        else if(e.name.endsWith('.vue')) vueFiles.push(p);
    }
})(ADMIN_SRC);

/** 模板部分：`<script>` 之前的所有内容（本项目所有 .vue 都是 template 在前），去掉 HTML 注释 */
const templateOf = (src) => {
    const cut = src.indexOf('<script');
    const tpl = cut === -1 ? src : src.slice(0, cut);
    return tpl.replace(/<!--[\s\S]*?-->/g, '');
};

const elTags = new Map();      // el-xxx -> Set(相对文件)
const pascalTags = new Map();  // PascalCase -> Set(相对文件)

for(const file of vueFiles) {
    const rel = path.relative(ADMIN_SRC, file).split(path.sep).join('/');
    const tpl = templateOf(read(file));
    const add = (map, key) => {
        if(!map.has(key)) map.set(key, new Set());
        map.get(key).add(rel);
    };
    for(const m of tpl.matchAll(/<\/?(el-[a-z0-9-]+)/g)) add(elTags, m[1]);
    for(const m of tpl.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) add(pascalTags, m[1]);
}

// ── 3. 比对 ────────────────────────────────────────────────────────────
const errors = [];
const warns = [];
const list = (s) => [...s].sort().join(', ');

const tag2name = new Map(registered.map(n => [toTag(n), n]));
const style2name = new Map(registered.map(n => [toStyleDir(n), n]));
const hasStyle = (dir) => fs.existsSync(path.join(EP_DIR, dir, 'style', 'css.mjs'));

for(const [tag, where] of [...elTags].sort()) {
    if(!tag2name.has(tag)) {
        errors.push(`模板用了 <${tag}> 但 COMPONENTS 里没注册 → 生产环境静默不渲染  （${list(where)}）`);
    }
}
for(const name of registered) {
    if(!imported.includes(name)) {
        errors.push(`COMPONENTS 里有 ${name} 但没有从 'element-plus' import → 注册的是 undefined`);
    }
    if(!/^El[A-Z]/.test(name)) {
        warns.push(`${name} 不是 El 开头的名字，脚本无法自动推导它的 style 目录，请人工确认`);
    }
    const dir = toStyleDir(name);
    if(!styleImports.includes(dir)) {
        errors.push(`<${toTag(name)}> 注册了但没引 'element-plus/es/components/${dir}/style/css' → 组件裸 HTML 没样式`);
    } else if(!hasStyle(dir)) {
        errors.push(`'element-plus/es/components/${dir}/style/css' 这个目录在 node_modules 里不存在 → 拼错组件名了？`);
    }
    if(!elTags.has(toTag(name))) {
        warns.push(`${name}（<${toTag(name)}>）注册了但任何模板都没用到 → 可以删掉注册和 style import`);
    }
}
for(const name of imported) {
    if(!registered.includes(name) && !PLUGINS.includes(name)) {
        warns.push(`import 了 ${name} 但既没进 COMPONENTS 也不在插件白名单 → 是不是忘了注册？`);
    }
}
const PLUGIN_STYLES = ['loading', 'message', 'message-box'];
for(const dir of new Set(styleImports)) {
    if(!style2name.has(dir) && !PLUGIN_STYLES.includes(dir)) {
        warns.push(`引了 ${dir} 的样式，但 COMPONENTS 里没有对应组件 → 冗余样式`);
    }
    if(!hasStyle(dir)) {
        errors.push(`'element-plus/es/components/${dir}/style/css' 这个目录在 node_modules 里不存在 → 拼错组件名了？`);
    }
}
for(const [tag, where] of [...pascalTags].sort()) {
    if(TAG_ALLOWLIST.has(tag)) continue;
    if(!icons.includes(tag)) {
        errors.push(`模板用了 <${tag} /> 但 ICONS 里没注册（且不在本地组件白名单）→ 渲染成无意义空标签  （${list(where)}）`);
    }
}
for(const name of icons) {
    if(!pascalTags.has(name)) {
        warns.push(`图标 ${name} 注册了但任何模板都没用到 → 可以删掉`);
    }
}

// ── 4. 输出 ────────────────────────────────────────────────────────────
const stat = `扫描 ${vueFiles.length} 个 .vue：模板里 ${elTags.size} 个 el-* 标签 / ${registered.length} 个已注册组件 / ${icons.length} 个已注册图标`;
if(!errors.length && !warns.length) {
    console.log(`✓ Element Plus 按需引入自检通过（${stat}）`);
    process.exit(0);
}

console.log(stat);
for(const e of errors) console.log('  ERROR  ' + e);
for(const w of warns) console.log('  WARN   ' + w);
console.log(`\n${errors.length} 个错误、${warns.length} 个提示`);

if(errors.length && !warnOnly) process.exit(1);
