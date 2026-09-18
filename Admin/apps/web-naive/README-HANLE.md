# 富商剧场管理后台

本应用基于 Vue Vben Admin 的 Naive UI 版本，业务代码集中在 `src/views/operations`，接口集中在 `src/api/admin.ts`。

## 本地运行

先启动根目录下的 Express 后端（默认端口 `3000`），然后在 `Admin` 目录运行：

```bash
pnpm dev:naive
```

开发服务器会将 `/api/*` 转发为 `http://localhost:3000/api/v1/*`。初始化管理员账号由 `Backend/prisma/seed.ts` 创建。

## 权限约定

- `dashboard:read`：运营概览
- `user:read`：用户列表
- `user:update`：启用或禁用用户
- `audit:read`：操作日志

路由通过 `meta.authority` 控制页面访问，页面按钮通过 `hasAccessByCodes` 控制显示；后端仍会再次执行权限校验，前端隐藏按钮不能替代服务端鉴权。

## 扩展方式

新增模块时，分别增加 `src/api/<module>.ts`、`src/views/operations/<module>` 和 `src/router/routes/modules` 中的路由配置。页面不要直接拼接接口地址，也不要绕过 API 层访问后端。
