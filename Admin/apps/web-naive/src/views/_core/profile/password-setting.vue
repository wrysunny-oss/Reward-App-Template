<script setup lang="ts">
import type { VbenFormSchema } from '#/adapter/form';

import { computed } from 'vue';

import { ProfilePasswordSetting, z } from '@vben/common-ui';

import { message } from '#/adapter/naive';
import { changePasswordApi } from '#/api/core/auth';
import { useAuthStore } from '#/store';
import { clearRememberedLogin } from '#/utils/remember-login';

const authStore = useAuthStore();
let submitting = false;

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      fieldName: 'oldPassword',
      label: '旧密码',
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: '请输入旧密码',
      },
      rules: z.string().min(6, { message: '请输入至少 6 位旧密码' }).max(72),
    },
    {
      fieldName: 'newPassword',
      label: '新密码',
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: '请输入新密码',
      },
      rules: z.string().min(8, { message: '新密码至少 8 位' }).max(72),
    },
    {
      fieldName: 'confirmPassword',
      label: '确认密码',
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: '请再次输入新密码',
      },
      dependencies: {
        rules(values) {
          const { newPassword } = values;
          return z
            .string({ error: '请再次输入新密码' })
            .min(1, { message: '请再次输入新密码' })
            .refine((value) => value === newPassword, {
              message: '两次输入的密码不一致',
            });
        },
        triggerFields: ['newPassword'],
      },
    },
  ];
});

async function handleSubmit(values: Record<string, string>) {
  if (submitting) return;
  submitting = true;
  try {
    await changePasswordApi({ oldPassword: values.oldPassword!, newPassword: values.newPassword! });
    clearRememberedLogin();
    message.success('密码修改成功，请使用新密码重新登录');
    await authStore.logout(false);
  } finally {
    submitting = false;
  }
}
</script>
<template>
  <ProfilePasswordSetting
    class="w-full"
    :form-schema="formSchema"
    @submit="handleSubmit"
  />
</template>
