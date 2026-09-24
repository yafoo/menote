// 前台 API 封装
//
// 全部走 /api/pub/*，这个控制器**匿名可访问**（服务端 app/api/controller/pub.js，
// 认证中间件对它直接放行）。它只返回 is_public=1 分类下的数据。
//
// 注意：不要在前台复用后台的 /api/*（那些需要 cookie 或 token），
// 也不要在前台暴露任何写操作。

const HEADERS = {'X-Requested-With': 'XMLHttpRequest'};

async function get(path, params) {
    const url = new URL(path, location.origin);
    if(params) {
        for(const [key, value] of Object.entries(params)) {
            if(value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        }
    }
    try {
        const res = await fetch(url, {headers: HEADERS});
        return await res.json();
    } catch(e) {
        console.error('[pub api]', path, e);
        return {state: 0, msg: '网络错误'};
    }
}

export const api = {
    // 站点信息 + 公开分类树
    config() {
        return get('/api/pub/config');
    },
    // 公开笔记列表（分页）
    notes({cate_id, page, rows} = {}) {
        return get('/api/pub/notes', {cate_id, page, rows});
    },
    // 单篇公开笔记 + 反向链接
    note(id) {
        return get('/api/pub/note', {id});
    },
    // 搜索公开笔记
    search(q, cate_id) {
        return get('/api/pub/search', {q, cate_id});
    },
    // 知识图谱（只含公开笔记及其之间的链接）
    graph() {
        return get('/api/pub/graph');
    }
};
