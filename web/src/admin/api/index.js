import { ElMessage } from 'element-plus';

// ==================== 统一请求封装与 API 调用 ====================
let lastNetworkErrorAt = 0;

export async function request(url, options = {}) {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const config = {
        ...options,
        headers: { ...defaultHeaders, ...(options.headers || {}) }
    };
    if(config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    try {
        const res = await fetch(url, config);
        // 502 / 503 代理不可用：P2P 隧道断开时后端返回的码
        if(res.status === 502 || res.status === 503) {
            const now = Date.now();
            if(now - lastNetworkErrorAt > 5000) {  // 5s 节流
                lastNetworkErrorAt = now;
                ElMessage.warning('网络连接已断开，正在自动重连…');
            }
        }
        const text = await res.text();
        // 403 代理不可用：P2P 隧道断开时后端返回的码
        if(res.status === 403) {
            if(text.includes('FN Connect')) {
                ElMessage.warning('FN Connect 暂无权限访问该服务，请检查飞牛登录是否已过期');
            } else {
                ElMessage.warning('403 Forbidden');
            }
        }
        try {
            return JSON.parse(text);
        } catch(e) {
            console.error('JSON parse error:', text.substring(0, 200));
            return { state: 0, msg: '响应解析失败' };
        }
    } catch(e) {
        // fetch 本身抛异常：网络完全不通/DNS 失败等
        const now = Date.now();
        if(now - lastNetworkErrorAt > 5000) {
            lastNetworkErrorAt = now;
            ElMessage.error('无法连接服务器，请检查网络');
        }
        return { state: 0, msg: '网络错误' };
    }
}

export const api = {
    // 创建分类
    async createCate(data) {
        return await request('/api/cate/create', { method: 'POST', body: data });
    },

    // 更新分类
    async updateCate(data) {
        return await request('/api/cate/edit', { method: 'POST', body: data });
    },

    // 分类排序
    async sortCate(items) {
        return await request('/api/cate/sort', { method: 'POST', body: { items } });
    },

    // 删除分类
    async deleteCate(id) {
        return await request(`/api/cate/delete?id=${id}`);
    },

    // 创建笔记
    async createNote(data) {
        return await request('/api/note/create', { method: 'POST', body: data });
    },

    // 更新笔记
    async updateNote(data) {
        return await request('/api/note/edit', { method: 'POST', body: data });
    },

    // 删除笔记
    async deleteNote(id) {
        return await request(`/api/note/delete?id=${id}`);
    },

    // 置顶/取消置顶笔记
    async pinNote(id, isPinned) {
        return await request('/api/note/pin', {
            method: 'POST',
            body: { id, is_pinned: isPinned }
        });
    },

    // 笔记排序
    async sortNotes(items) {
        return await request('/api/note/sort', {
            method: 'POST',
            body: { items }
        });
    }
};
