// 后台公共小工具
//
// 只放"多个组件真的都要用"的东西。后台组件本来就少，一个函数只有一处调用的话，
// 留在原地读起来更省事，搬进来反而要多跳一次文件。

/**
 * 相对时间（列表场景）：今天 → HH:mm，昨天 → "昨天"，
 * 今年内 → M/D，跨年 → Y/M/D
 *
 * 时间戳单位是**秒**（跟库里的 add_time / update_time 一致）。
 * 为 0 / 空时返回空串，而不是 1970-01-01。
 *
 * 原先是 NoteList.vue 里的局部 formatTime，逐字搬过来的。
 */
export function formatRelativeTime(timestamp) {
    if(!timestamp) return '';
    const d = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if(isToday) {
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if(d.toDateString() === yesterday.toDateString()) {
        return '昨天';
    }
    if(d.getFullYear() === now.getFullYear()) {
        return (d.getMonth() + 1) + '/' + d.getDate();
    }
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}

/**
 * 绝对时间（明细场景）：本地化的 "Y/M/D HH:mm:ss"
 *
 * 跟上面那个**不是**一回事，别互相替换：Token 过期时间、P2P 请求时间这类场合
 * 要的是"准确到秒的绝对时刻"，"昨天"这种相对说法反而没法用。
 *
 * 交给 Intl（toLocaleString）而不是自己拼，是因为它顺带处理了 12/24 小时制等
 * 区域差异，输出格式随运行环境走——这里只求可读，不求跨端一致。
 *
 * 原先是 TokenManage.vue 和 P2pManage.vue 里各写了一遍的局部 formatTime
 * （那两份完全相同，已合并到这里）。
 */
export function formatDateTime(timestamp) {
    if(!timestamp) return '';
    const d = new Date(timestamp * 1000);
    return d.toLocaleString('zh-CN');
}
