---
version: alpha
name: "Reward App Template Baseline"
description: "面向中文移动用户的深色短剧与奖励产品，金色只承担品牌和关键行动。"
colors:
  background: "#080B12"
  surface: "#111620"
  surface-alt: "#181E2A"
  primary: "#E7B84A"
  primary-pressed: "#CFA13B"
  text: "#F5F7FA"
  muted: "#969EAD"
  success: "#34C892"
  danger: "#F06C78"
  border: "#252D3A"
typography:
  sans:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "15px"
    lineHeight: "22px"
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "30px"
    lineHeight: "38px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button: {}
  card: {}
  dialog: {}
  empty-state: {}
  bottom-navigation: {}
---

# 奖励应用模板迁移基线

> 本文件记录归档基线当前实现，用于保证模板改造期间不发生无意视觉回归；它不是新产品可直接换色复用的品牌方案。每个从模板创建的 APP 都必须根据内容类型、受众和使用场景重写 `name`、`description`、Creative North Star、视觉令牌与组件规则，并同步更新运行时主题。

## Overview

### Creative North Star

界面以夜间影院的低照度环境为参考：深蓝黑承载长时间观看，克制的暖金色标记价值和主要行动。它不是霓虹娱乐厅，也不是堆叠渐变和发光卡片的游戏化界面。

### Product context and register

- **Audience and primary job:** 中文移动端用户浏览短剧、完成奖励任务并管理收益；运营人员在桌面后台维护内容和资金规则。
- **Target market and locale:** 当前业务、手机号、时区与文案证据指向中国大陆市场；界面语言为简体中文，业务时间使用 `Asia/Shanghai`。
- **Usage scene:** APP 以单手移动操作和持续观看为主；Admin 以桌面高密度运营操作为主。
- **Register:** APP 是品牌与产品混合界面，Admin 是任务清晰度优先的产品界面。
- **Memorable signature:** 暖金关键行动与深色影院表面形成稳定对比。
- **Restraint:** 表单、资金、权限和错误状态优先使用熟悉的产品模式，不为品牌表达牺牲可读性。
- **Anti-references:** 不使用廉价霓虹、无意义渐变、悬浮玻璃卡片或与短剧业务无关的装饰。
- **Token ownership/runtime mapping:** 成熟代码库采用运行时令牌为唯一来源；APP 以 `MobileReactNative/src/theme/index.ts` 为准，本文件镜像其语义值，不生成代码。Admin 保留 Vben/Naive UI 的既有主题体系。

### Template inheritance boundary

- 模板继承的是认证、账户、奖励、邀请、提现、广告、风控、通知和更新等功能行为，不继承“深色影院 + 暖金”的最终视觉身份。
- 新产品开始 UI 工作前，必须先确定具体内容主题、目标用户、页面主任务和一项有依据的视觉特征，再重构 APP 导航、首页和业务页面。
- 禁止把更换名称、主色、图标或首页插图当作完成 UI 重构。
- 功能重构期间保留共享状态、错误恢复、无障碍和资金安全约束；视觉变化不得改变服务端确认后才展示奖励到账等业务规则。
- Admin 可以延续稳定的高密度运营交互，但品牌名称、内容术语、菜单和内容配置页面必须随产品类型调整。

## Colors

背景、表面和边框形成三层安静层级。`primary` 只用于主要行动、选中状态和收益强调；成功与危险保持独立语义，不能用金色代替错误或成功状态。

## Typography

APP 使用系统无衬线字体以保证 Android/iOS 中文覆盖和加载稳定。正文基线为 15/22，标题通过尺寸和字重建立层级。金额与次数保持清晰、紧凑，不使用装饰性斜体。

## Layout

APP 页面沿用 16px 水平内边距、24px 区块间距和安全区容器。底部导航是一级业务入口；关闭模板模块时直接移除无关入口，不留下禁用占位。加载、错误和空状态应保持内容区域几何稳定。

## Elevation & Depth

默认通过色阶和 1px 边框分层；只有核心余额卡、登录卡等少量焦点表面使用低透明度阴影。弹窗遮罩必须使用统一 overlay 色，不叠加发光效果。

## Shapes

输入和按钮使用 12px 圆角，卡片使用 16px，大型品牌容器最多 24px。图标容器与控件遵循同一圆角家族，不使用全屏散落胶囊形状。

## Components

- 按钮、卡片、空状态、弹窗和列表行复用 `MobileReactNative/src/components` 中的共享组件。
- 禁用和忙碌状态必须同时阻止交互，并保持按钮尺寸不变。
- 模块不可用时优先移除入口；尚未配置内容首页时，使用不含旧业务术语的共享 `EmptyState` 提供明确说明。
- 图标使用项目 `AppIcon` 语义名称，重要操作始终保留文字标签。
- 动效只表达按压、导航与状态变化，并复用 `motion.tokens.ts`；不得另建页面级时长常量。

## Do's and Don'ts

- **Do:** 从语义主题、共享组件和现有导航结构组合页面。
- **Do:** 对资金、认证和模块权限同时执行客户端入口控制与服务端校验。
- **Don't:** 在功能页面直接散落新的十六进制颜色、间距或圆角。
- **Don't:** 用“隐藏按钮”代替后端权限或模块边界。
