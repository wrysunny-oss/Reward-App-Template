-- 对外统一称为“代理”；保留 role.code，兼容历史数据和已上线代码。
UPDATE `roles`
SET `name` = '代理',
    `description` = '由管理员创建、可登录只读后台的代理用户'
WHERE `code` = 'level_one_agent';
