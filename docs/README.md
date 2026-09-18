# 奖励应用模板文档中心

本目录是项目文档索引。文档按用途分类，但为避免破坏已有链接，部分长期文档仍保留在仓库根目录或对应子项目中。

## 产品与业务

| 文档                               | 用途                                     | 状态     |
| ---------------------------------- | ---------------------------------------- | -------- |
| [项目功能说明](../项目功能说明.md) | 三端现有功能、角色、奖励、返佣和验收重点 | 当前依据 |
| [UX Contract](../UX-CONTRACT.md)   | 页面行为、异步反馈和跨端交互约束         | 开发约束 |
| [设计系统](../DESIGN.md)           | 色彩、排版、布局和组件规范               | 开发约束 |

## 配置与开发

| 文档                                                           | 用途                               |
| -------------------------------------------------------------- | ---------------------------------- |
| [产品配置说明](../产品配置说明.md)                             | 品牌、域名、模块开关和广告位配置   |
| [Backend README](../Backend/README.md)                         | 后端本地启动与 API 分区            |
| [后端架构约定](../Backend/ARCHITECTURE.md)                     | 目录职责、依赖方向和高风险业务约束 |
| [Admin README](../Admin/apps/web-naive/README-HANLE.md)        | 管理端本地运行、权限和扩展方式     |
| [APP README](../MobileReactNative/README.md)                   | APP 技术栈、本地运行和签名变量     |
| [原生 SDK 配置](../MobileReactNative/docs/NATIVE_SDK_SETUP.md) | GroMore 及聚合广告 SDK 依赖准备    |
| [广告奖励共享契约](../contracts/README.md)                     | 阶梯任务与广告分成的共享字段       |

## 部署、发布与运维

| 文档                                                          | 用途                                      |
| ------------------------------------------------------------- | ----------------------------------------- |
| [生产部署操作指南](../生产部署操作指南.md)                    | 首次部署和后续迭代的完整流程              |
| [部署命令速查](../deploy/README.md)                           | 已熟悉架构后的常用部署命令                |
| [APP 版本发布指南](APP版本发布指南.md)                        | 版本号、APK/AAB、升级策略及验证           |
| [线上故障排查手册](线上故障排查手册.md)                       | Docker、API、Nginx、MySQL 和 APP 更新排查 |
| [本地上传目录与备份](../Backend/docs/local-upload-storage.md) | 图片持久化、安全和备份要求                |

## 推荐阅读路径

- 新开发人员：项目功能说明 → 产品配置说明 → 对应子项目 README → UX/设计约束。
- 首次上线：生产部署操作指南 → APP 版本发布指南 → 上线核验清单。
- 日常迭代：部署命令速查 → APP 版本发布指南 → 线上故障排查手册。
- 复制新项目：产品配置说明 → `npm run product:init` → `npm run product:doctor`。

## 单一事实来源

- 当前实现能力：`项目功能说明.md`
- 非敏感产品参数：`product.config.json`
- 生产环境变量模板：`deploy/.env.example`、`deploy/backend.env.example`
- 数据库结构：`Backend/prisma/schema.prisma` 与 migrations
- APP 版本号：`MobileReactNative/android/app/build.gradle`
- UI 视觉规范：`DESIGN.md`
- UI 行为规范：`UX-CONTRACT.md`

发现文档与代码不一致时，以代码和数据库迁移为准，并在同一次修改中更新对应文档。
