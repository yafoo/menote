// Token 权限分组定义（与后端 app/model/token.js 保持一致）
export const TOKEN_PERM_GROUPS = [
    {
        name: '分类管理',
        items: [
            {key: 'cate_read',   label: '查看'},
            {key: 'cate_create', label: '新增'},
            {key: 'cate_edit',   label: '编辑'},
            {key: 'cate_delete', label: '删除'},
        ]
    },
    {
        name: '笔记管理',
        items: [
            {key: 'note_read',   label: '查看'},
            {key: 'note_create', label: '新增'},
            {key: 'note_edit',   label: '编辑'},
            {key: 'note_delete', label: '删除'},
        ]
    }
];
