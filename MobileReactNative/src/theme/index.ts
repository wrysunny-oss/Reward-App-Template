import {
  fonts,
  media,
  settings,
  shorthands,
  themes,
  tokens,
} from '@tamagui/config/v5';
import {createTamagui} from '@tamagui/core';
import {animations} from './motion';

/** 模板迁移基线的全局语义色。页面只能引用语义，不直接散落色值。 */
export const colors = {
  background: '#080B12',
  surface: '#111620',
  surfaceAlt: '#181E2A',
  surfaceHighlight: '#212938',
  overlay: 'rgba(8, 11, 18, 0.72)',
  primary: '#E7B84A',
  primaryPressed: '#CFA13B',
  primarySoft: '#2C2515',
  text: '#F5F7FA',
  muted: '#969EAD',
  subtle: '#657083',
  success: '#34C892',
  successSoft: '#122C27',
  danger: '#F06C78',
  dangerSoft: '#321B22',
  border: '#252D3A',
  divider: '#1D2430',
} as const;

/** 设计系统仅允许使用这六档间距。 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 控件、卡片和大容器分别使用 8/12/16/24 四档圆角。 */
export const radii = {sm: 8, md: 12, lg: 16, xl: 24} as const;

export const typography = {
  display: {fontSize: 30, lineHeight: 38, fontWeight: '800' as const},
  title: {fontSize: 24, lineHeight: 32, fontWeight: '700' as const},
  section: {fontSize: 18, lineHeight: 26, fontWeight: '700' as const},
  body: {fontSize: 15, lineHeight: 22, fontWeight: '400' as const},
  label: {fontSize: 13, lineHeight: 18, fontWeight: '600' as const},
  caption: {fontSize: 12, lineHeight: 17, fontWeight: '400' as const},
} as const;

export const layout = {
  pagePadding: spacing.lg,
  cardRadius: radii.lg,
  controlRadius: radii.md,
  sectionGap: spacing.xl,
} as const;

/** Tamagui 只负责运行时组件能力，色彩仍以本文件的语义变量为准。 */
export const tamaguiConfig = createTamagui({
  animations,
  fonts,
  media,
  settings,
  shorthands,
  tokens,
  themes: {
    ...themes,
    rewardApp: {
      ...themes.dark,
      background: colors.background,
      backgroundHover: colors.surface,
      backgroundPress: colors.surfaceAlt,
      backgroundFocus: colors.surface,
      color: colors.text,
      colorHover: colors.text,
      colorPress: colors.text,
      colorFocus: colors.text,
      borderColor: colors.border,
      borderColorHover: colors.primary,
      borderColorPress: colors.primaryPressed,
      borderColorFocus: colors.primary,
      shadowColor: '#000000',
    },
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module '@tamagui/web' {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
