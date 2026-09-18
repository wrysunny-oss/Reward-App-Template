<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed, nextTick, onMounted, ref } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';

import { useAuthStore } from '#/store';
import {
  clearRememberedLogin,
  getRememberedLogin,
  saveRememberedLogin,
} from '#/utils/remember-login';

defineOptions({ name: 'Login' });
const authStore = useAuthStore();
const loginRef = ref<InstanceType<typeof AuthenticationLogin>>();

/** 字段名继续使用 phone，与 Express 登录接口保持兼容。 */
const formSchema = computed((): VbenFormSchema[] => [
  {
    component: 'VbenInput',
    componentProps: { placeholder: '请输入管理员账号' },
    fieldName: 'phone',
    label: '账号',
    rules: z.string().min(1, { message: '请输入管理员账号' }),
  },
  {
    component: 'VbenInputPassword',
    componentProps: { placeholder: '请输入密码' },
    fieldName: 'password',
    label: '密码',
    rules: z.string().min(6, { message: '密码至少 6 位' }),
  },
]);

onMounted(async () => {
  const remembered = getRememberedLogin();
  if (!remembered) return;
  await nextTick();
  loginRef.value?.getFormApi().setValues(remembered);
});

async function handleSubmit(values: Record<string, unknown>) {
  const phone = String(values.phone ?? '');
  const password = String(values.password ?? '');
  const rememberMe = Boolean(values.rememberMe);
  const result = await authStore.authLogin({ phone, password });
  if (!result.userInfo) return;
  if (rememberMe) saveRememberedLogin({ phone, password });
  else clearRememberedLogin();
}
</script>

<template>
  <AuthenticationLogin
    ref="loginRef"
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-forget-password="false"
    :show-qrcode-login="false"
    :show-register="false"
    :show-remember-me="true"
    :show-third-party-login="false"
    remember-me-field-name="phone"
    sub-title="使用管理员账号和密码登录"
    @submit="handleSubmit"
  />
</template>
