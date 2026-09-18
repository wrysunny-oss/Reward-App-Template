<script lang="ts" setup>
import type { GlobalThemeOverrides } from 'naive-ui';

import { computed } from 'vue';

import { useNaiveDesignTokens } from '@vben/hooks';
import { preferences } from '@vben/preferences';

import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  lightTheme,
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
  zhCN,
} from 'naive-ui';

defineOptions({ name: 'App' });

const { commonTokens } = useNaiveDesignTokens();

const tokenLocale = computed(() =>
  preferences.app.locale === 'zh-CN' ? zhCN : enUS,
);
const tokenDateLocale = computed(() =>
  preferences.app.locale === 'zh-CN' ? dateZhCN : dateEnUS,
);
const tokenTheme = computed(() =>
  preferences.theme.mode === 'dark' ? darkTheme : lightTheme,
);

const themeOverrides = computed((): GlobalThemeOverrides => {
  return {
    common: commonTokens,
  };
});
</script>

<template>
  <NConfigProvider
    :date-locale="tokenDateLocale"
    :locale="tokenLocale"
    :theme="tokenTheme"
    :theme-overrides="themeOverrides"
    class="h-full"
  >
    <NNotificationProvider>
      <NMessageProvider>
        <!-- useDialog 必须位于 NDialogProvider 内，供运营配置等页面使用统一确认弹窗。 -->
        <NDialogProvider>
          <RouterView />
        </NDialogProvider>
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>

<style>
/*
 * preset="card" 弹窗统一采用固定头尾、内容区滚动的三段式布局。
 * 使用尺寸变量覆盖 Naive UI 运行时注入的宽度，避免弹窗意外铺满视口。
 */
.n-modal.n-card {
  --app-modal-width: 640px;

  display: flex;
  width: min(var(--app-modal-width), calc(100vw - 32px)) !important;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  max-height: calc(100dvh - 64px);
  overflow: hidden;
  box-sizing: border-box;
  flex-direction: column;
}

.n-modal.n-card > .n-card-header,
.n-modal.n-card > .n-card__footer {
  flex: 0 0 auto;
}

.n-modal.n-card > .n-card-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.n-modal.n-card > .n-card__footer {
  padding: 14px var(--n-padding-left) !important;
  border-top: 1px solid var(--n-border-color);
  background: var(--n-color);
}

.n-modal.n-card.modal-xs {
  --app-modal-width: 420px;
}

.n-modal.n-card.modal-sm,
.n-modal.n-card.action-modal {
  --app-modal-width: 520px;
}

.n-modal.n-card.modal-lg,
.n-modal.n-card.ticket-modal {
  --app-modal-width: 720px;
}

.n-modal.n-card.modal-xl,
.n-modal.n-card.risk-detail-modal {
  --app-modal-width: 960px;
}

/*
 * 风控明细包含五列表格和设备证据，比普通表单需要更大的可视宽度。
 * 外层负责裁剪，内容区独立滚动，避免表格和描述列表越过弹窗底部覆盖页面。
 */
.n-modal.n-card.risk-detail-modal {
  display: flex;
  overflow: hidden;
  flex-direction: column;
}

.n-modal.n-card.risk-detail-modal > .n-card-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}
</style>
