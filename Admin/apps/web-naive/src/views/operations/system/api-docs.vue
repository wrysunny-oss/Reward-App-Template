<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import { NButton, NCard } from 'naive-ui';

defineOptions({ name: 'ApiDocumentation' });

/** 独立打开便于使用 Swagger 的全屏调试体验。 */
function openStandalone() {
  window.open('/docs/', '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <Page title="接口文档" description="由后端 OpenAPI 定义生成，可查看参数、权限、响应并在线调试">
    <NCard content-style="padding: 0; overflow: hidden;">
      <template #header-extra><NButton secondary @click="openStandalone">新窗口打开</NButton></template>
      <iframe class="h-[calc(100vh-190px)] min-h-[680px] w-full border-0" src="/docs/" title="产品 API 文档"></iframe>
    </NCard>
  </Page>
</template>
