---
version: alpha
name: "富商剧场"
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

# 富商剧场设计系统

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
- 模块不可用时优先移除入口；短剧首页作为根路由无法移除时，使用共享 `EmptyState` 提供明确说明。
- 图标使用项目 `AppIcon` 语义名称，重要操作始终保留文字标签。
- 动效只表达按压、导航与状态变化，并复用 `motion.tokens.ts`；不得另建页面级时长常量。

## Do's and Don'ts

- **Do:** 从语义主题、共享组件和现有导航结构组合页面。
- **Do:** 对资金、认证和模块权限同时执行客户端入口控制与服务端校验。
- **Don't:** 在功能页面直接散落新的十六进制颜色、间距或圆角。
- **Don't:** 用“隐藏按钮”代替后端权限或模块边界。
