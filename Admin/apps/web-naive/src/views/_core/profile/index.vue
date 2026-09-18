<script setup lang="ts">
import { Page } from '@vben/common-ui';

import ProfilePasswordSetting from './password-setting.vue';
</script>
<template>
  <Page title="修改密码" description="修改后将撤销所有登录会话，请使用新密码重新登录">
    <div class="max-w-2xl rounded-lg border border-border bg-card p-6">
      <ProfilePasswordSetting />
    </div>
  </Page>
</template>
