# 富商剧场 UX Contract

## Product context

- Audience: 中文移动端短剧用户与桌面端运营人员。
- Primary jobs: 观看短剧、完成奖励、查看收益；配置内容、广告、邀请与提现规则。
- Target market: 中国大陆。
- Active locale: `zh-CN`。
- Timezone/calendar policy: `Asia/Shanghai`，公历。
- Accessibility target: WCAG 2.2 AA；移动端关键触点优先接近 44×44。

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
| --- | --- | --- | --- |
| 模板模块及依赖 | `product.config.json`, `产品配置说明.md` | 产品配置契约 | 2026-09-17 |
| API 与认证边界 | `Backend/src/docs/openapi.ts`, `Backend/src/middleware/auth.ts` | API / 权限实现 | 2026-09-17 |
| 奖励配置 | `contracts/reward.contract.json` | 三端接口契约 | 2026-09-17 |
| 提现状态与校验 | `Backend/src/modules/withdrawal` | 领域实现与测试 | 2026-09-17 |

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`。
- Token ownership: 现有运行时令牌为权威来源，DESIGN.md 镜像已接受值。
- APP runtime source: `MobileReactNative/src/theme/index.ts` 与共享组件。
- Admin runtime source: Vben/Naive UI 现有主题和共享布局。
- Supported themes: 当前正式产品只承诺深色主题。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form | `FormControls`, Admin 表单组件 | 现有共享组件 | 登录 / 编辑 | typecheck + workflow |
| Toast | `AppToast`, Admin message provider | 共享 provider | success / warning / error | interaction test |
| Dialog | `AppDialog`, Admin modal primitive | 共享 provider | alert / confirm / edit | viewport + focus |
| Empty/error | `DesignSystem.EmptyState` | APP 共享组件 | empty / failure / unavailable | narrow viewport |
| Navigation | `RootNavigator`, Admin route modules | 产品模块配置 | enabled / hidden | route + API tests |

## Navigation and module behavior

- `product.config.json` 是模板模块的唯一编辑入口，生成文件不可手改。
- 模块启用时，APP 页面、Admin 菜单和 Backend API 同时可用。
- 模块关闭时，入口从导航中移除；旧深链或手工 API 请求由 Backend 返回 404，表示该产品不存在此能力。
- 短剧首页是 APP 根导航的稳定锚点；`shortDrama=false` 时使用共享空状态，仍保留“我的”账户入口。
- `smsRegistration=false` 时隐藏注册标签，只保留已有账号登录。
- `invitations=false` 时注册不要求邀请码，分享、邀请码和邀请任务入口全部移除。
- `withdrawals=false` 时移除提现页面、按钮、收款账户表单及后台资金入口。
- Admin 父菜单跳转到第一个仍启用的子路由，不跳向已关闭模块。
- 模块依赖由同步脚本强制校验：邀请和提现依赖奖励，支付宝打款依赖提现。

## Async, validation and feedback

- 初始加载使用项目现有稳定骨架或品牌加载器；失败使用共享空状态并提供重试。
- 写操作使用稳定尺寸的忙碌按钮并阻止重复提交。
- 福利中心可在页面聚焦后预加载任务激励广告，但不得提前触发风控采集或发奖；离开页面时释放未展示广告，避免与短剧解锁广告串用。
- SDK 完整观看信号只允许提示“收益确认中”；“奖励已到账”和金币余额更新必须等待服务端 SSV 回调完成结算。
- 表单错误保留非敏感输入；密码和密钥不得进入日志、URL、Toast 或持久缓存。
- APP 弹窗统一使用 `AppDialog`，禁止原生 `alert`/`confirm`/`prompt`。
- 服务端是认证、权限、资金和模块能力的最终边界，客户端隐藏只负责体验。

## Verification

- Required: 三端 typecheck、Backend tests、Admin/APP lint、`git diff --check`。
- Module matrix: 至少验证全开启，以及关闭邀请、关闭提现、关闭广告、关闭短信注册四种模板组合。
- Canonical sibling: APP 的 Profile 快捷入口、Tasks 任务入口和 RootNavigator 深层页面必须保持一致。
- Failure path: 关闭模块后，直接请求相关 API 应返回 404，不能执行副作用。
