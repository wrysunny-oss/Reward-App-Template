import { h, ref } from 'vue';

import { NInput, NText } from 'naive-ui';

import { dialog, message } from '#/adapter/naive';

export class SecondaryVerificationCancelledError extends Error {
  constructor() {
    super('已取消二次验证');
    this.name = 'SecondaryVerificationCancelledError';
  }
}

/**
 * 高风险操作统一密码确认框。
 * 密码仅存在于弹窗闭包中，确认后交给当前请求，不写入 Store 或本地缓存。
 */
export function requestSecondaryPassword(action = '执行当前高风险操作') {
  return new Promise<string>((resolve, reject) => {
    const password = ref('');
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    dialog.warning({
      title: '登录密码二次验证',
      content: () =>
        h('div', { class: 'secondary-verification-content' }, [
          h(
            NText,
            { depth: 3 },
            { default: () => `为保障账号安全，${action}前需要验证当前登录密码。` },
          ),
          h(NInput, {
            autofocus: true,
            clearable: true,
            placeholder: '请输入当前登录密码',
            showPasswordOn: 'click',
            style: { marginTop: '16px' },
            type: 'password',
            value: password.value,
            'onUpdate:value': (value: string) => {
              password.value = value;
            },
          }),
          h(
            NText,
            {
              depth: 3,
              style: {
                display: 'block',
                fontSize: '12px',
                lineHeight: '1.6',
                marginTop: '10px',
              },
            },
            { default: () => '密码仅用于本次验证，不会保存或写入浏览器缓存。' },
          ),
        ]),
      positiveText: '验证并继续',
      negativeText: '取消',
      closable: false,
      closeOnEsc: false,
      maskClosable: false,
      onPositiveClick: () => {
        if (!password.value) {
          message.warning('请输入当前登录密码');
          return false;
        }
        finish(() => resolve(password.value));
      },
      onNegativeClick: () => {
        finish(() => reject(new SecondaryVerificationCancelledError()));
      },
    });
  });
}
