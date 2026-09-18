# HanLe Theater API

Express 5 + TypeScript + Prisma + MySQL 的模块化单体后端，同时承载 App API、代理端 API 与运营后台 API。

代码目录、依赖方向、注释规范和新增模块方式见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 本地启动

需要 Node.js 20+、npm 和 Docker（或本机 MySQL 8）。

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run db:seed
npm run dev
```

Windows PowerShell 用 `Copy-Item .env.example .env` 替代第一行。健康检查：`GET http://localhost:3000/health`。

初始管理员手机号为 `13800000000`，密码读取 `.env` 的 `ADMIN_INITIAL_PASSWORD`。首次登录后务必修改；生产环境不要使用示例密钥和密码。

## 本地图片存储

项目不使用 CDN。生产环境请通过 `UPLOAD_DIRECTORY` 将图片保存到独立持久化目录，并将该目录与数据库一起备份。完整部署与恢复说明见 [本地图片存储与备份](./docs/local-upload-storage.md)。

## API 分区

- `/api/v1/auth`：注册、登录、当前用户
- `/api/v1/content`：短剧列表、搜索、剧集播放信息
- `/api/v1/library`：收藏和播放历史
- `/api/v1/admin`：数据看板、用户管理、权限、审计日志

响应统一为 `{ code, message, data, requestId }`，数据库 `BigInt` ID 在 JSON 中统一返回字符串。

## 中后台建议

建议新增独立的 `Admin` 工程：Vue 3 + Vite + TypeScript + Element Plus + Pinia。菜单由权限码控制，按钮权限直接对应 API 权限码。第一阶段做工作台、用户、短剧/剧集、反馈、提现审核、任务配置、角色权限和审计日志；支付、短信、对象存储、广告回调都通过 provider 接口接入，不把厂商 SDK 写进业务层。

生产部署还应增加 Redis（验证码、限流、会话与任务锁）、对象存储/CDN、队列任务、OpenAPI 文档和监控告警。金币、提现、佣金必须使用数据库事务、幂等业务号与不可变流水，不能只修改余额字段。
