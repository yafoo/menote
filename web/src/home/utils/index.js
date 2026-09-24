// 前台公共小工具

/**
 * 时间戳格式化（秒）
 * 旧 SSR 模板用的是 dateFormat(note.add_time, 'Y-m-d')
 *
 * add_time 为 0 时返回空串——库里有些早期笔记 add_time 是 0，
 * 直接格式化会显示 1970-01-01，比留空更难看
 */
export function formatTime(ts, withTime = false) {
    if(!ts) return '';
    const d = new Date(Number(ts) * 1000);
    if(isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

/**
 * 关键词串转数组
 * 旧模板是 {{note.keywords.split(',')}}，这里额外过滤空项
 */
export function splitTags(keywords) {
    if(!keywords) return [];
    return String(keywords).split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * 把分类树拍平成一维数组
 *
 * 服务端 getPublicCateTree 返回的是嵌套结构（子分类在 children 里），
 * 而 /cate/:id 可能指向任意层级，所以查找前要先拍平——
 * 否则直接访问子分类 URL（如 /cate/4）会找不到分类名
 */
export function flattenCates(tree) {
    const out = [];
    const walk = (list) => {
        for(const item of list || []) {
            out.push(item);
            if(item.children && item.children.length) walk(item.children);
        }
    };
    walk(tree);
    return out;
}
