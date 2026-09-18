# 富商剧场

富商剧场是一套包含 Android APP、运营管理后台、Node.js API、MySQL 数据库及 Docker 生产部署配置的短剧运营系统。

## 项目组成

| 目录 | 说明 | 主要技术 |
| --- | --- | --- |
| `MobileReactNative/` | Android 用户端 | React Native、TypeScript、Kotlin、GroMore |
| `Admin/` | 运营管理后台 | Vue 3、Vben Admin、Naive UI |
| `Backend/` | API 与业务服务 | Node.js、Express、Prisma |
| `deploy/` | 生产环境编排与配置模板 | Docker Compose、MySQL 8.4 |
| `contracts/` | APP、Admin、Backend 共享业务契约 | JSON、代码生成脚本 |
| `scripts/` | 产品初始化、配置同步和部署体检 | Node.js |

## 文档入口

第一次接触项目，建议依次阅读：

1. [项目功能说明](项目功能说明.md)：了解三端功能、角色和业务规则。
2. [产品配置说明](产品配置说明.md)：了解复制模板后如何更换品牌、域名、广告位与模块开关。
3. [生产部署操作指南](生产部署操作指南.md)：完成 Backend、MySQL、Admin 和域名部署。
4. [APP 版本发布指南](docs/APP版本发布指南.md)：修改版本号、打包、上传并配置升级策略。
5. [线上故障排查手册](docs/线上故障排查手册.md)：查看容器、API、Nginx、数据库和更新问题。

完整文档分类见 [文档中心](docs/README.md)。

## 常用命令

仓库根目录：

```powershell
npm.cmd run product:init
npm.cmd run product:doctor
node scripts/sync-product-config.mjs
```

后端：

```powershell
cd Backend
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run dev
```

管理后台：

```powershell
cd Admin
pnpm install --frozen-lockfile
pnpm --filter @vben/web-naive typecheck
pnpm --filter @vben/web-naive run build
```

Android APP：

```powershell
cd MobileReactNative
npm.cmd install
npm.cmd run typecheck
npm.cmd test -- --runInBand
```

## 配置原则

- 非敏感的三端共享配置统一写入 `product.config.json`。
- 生产数据库密码、JWT 密钥、短信 AccessKey、支付宝私钥等只写入服务器 `deploy/.env` 或 `deploy/backend.env`。
- APP 签名密码只通过本机环境变量或 CI 密钥注入。
- `src/generated`、`src/contracts` 和 `product.generated.json` 是脚本生成结果，不手动编辑。
- 修改数据库结构必须创建 Prisma migration，生产环境只执行 `prisma migrate deploy`。

## 文档维护约定

- 根目录文档用于跨端产品、配置和部署说明。
- 子项目独有内容放在对应目录，例如 `Backend/README.md`、`MobileReactNative/README.md`。
- `DESIGN.md` 与 `UX-CONTRACT.md` 是界面和交互实现约束，保留在仓库根目录。
- `_ 广告联盟App需求整理.md` 是早期需求原稿，仅用于需求追溯；当前能力以 `项目功能说明.md` 和实际代码为准。
- 同一操作只保留一份详细说明，其他文档使用链接引用，避免命令长期不一致。

## 安全提醒

不要提交 `.env`、`backend.env`、数据库备份、支付证书、AccessKey、私钥、签名库密码或真实用户数据。生产服务只通过 HTTPS 暴露，MySQL 3306 和 Backend 3000 不直接开放公网。
