/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from '#/adapter/naive';
import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

/**
 * 后端将持久化图片保存为 /uploads/... 相对路径；生产环境管理端与 API
 * 使用不同域名，因此展示前必须将其解析到 API 域名。外部绝对地址保持不变。
 */
export function resolveAssetUrl(value: string) {
  const url = value.trim();
  if (!url.startsWith('/uploads/')) return url;
  try {
    const pageOrigin = globalThis.location?.origin ?? 'http://localhost';
    const apiOrigin = new URL(apiURL, pageOrigin).origin;
    return new URL(url, apiOrigin).toString();
  } catch {
    return url;
  }
}

/** 将富文本中历史保存的相对上传地址转换为当前 API 域名。 */
export function resolveRichTextAssetUrls(content: string) {
  return content.replace(
    /(\bsrc=["'])\/uploads\//gi,
    (_match, prefix: string) => `${prefix}${resolveAssetUrl('/uploads/')}`,
  );
}

/**
 * 将访问令牌格式化为标准的 Bearer 认证请求头。
 *
 * 普通接口客户端和文件下载客户端都会使用该方法，因此必须定义在
 * `createRequestClient` 外部，避免下载时出现作用域错误。
 */
function formatToken(token: null | string) {
  return token ? `Bearer ${token}` : null;
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `admin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate() {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const resp = await refreshTokenApi();
    const newToken = resp.accessToken;
    accessStore.setRefreshToken(resp.refreshToken);
    accessStore.setAccessToken(newToken);
    return newToken;
  }

  // 请求头处理
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      config.headers['X-Request-Id'] ||= createRequestId();
      return config;
    },
  });

  // 处理返回的响应数据格式
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  // token过期的处理
  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      // 后台固定启用静默续签，避免历史本地偏好缓存关闭该能力。
      enableRefreshToken: true,
      formatToken,
    }),
  );

  // 仅重试不会修改数据的读取请求，避免提现、审核等写操作被重复提交。
  client.addResponseInterceptor({
    rejected: async (error: any) => {
      const config = error?.config;
      const method = String(config?.method || 'GET').toUpperCase();
      const status = error?.response?.status;
      const retryable = !error?.response || [408, 425, 429, 502, 503, 504].includes(status);
      const retryCount = Number(config?.__safeRetryCount || 0);
      const retryLimit = error?.message?.includes?.('timeout') ? 1 : 2;
      if (!config || !['GET', 'HEAD', 'OPTIONS'].includes(method) || !retryable || retryCount >= retryLimit) {
        throw error;
      }
      config.__safeRetryCount = retryCount + 1;
      const retryAfter = Number(error?.response?.headers?.['retry-after']);
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 3000)
        : config.__safeRetryCount === 1 ? 350 : 900;
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), delay);
      });
      return client.request(config.url, { ...config });
    },
  });

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      // 这里可以根据业务进行定制,你可以拿到 error 内的信息进行定制化处理，根据不同的 code 做不同的提示，而不是直接使用 message.error 提示 msg
      // 当前mock接口返回的错误字段是 error 或者 message
      const responseData = error?.response?.data ?? {};
      const errorMessage = responseData?.error ?? responseData?.message ?? '';
      const requestId = responseData?.requestId ?? error?.response?.headers?.['x-request-id'];
      // 如果没有错误信息，则会根据状态码进行提示
      message.error(`${errorMessage || msg}${requestId ? `（问题编号：${requestId}）` : ''}`);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(apiURL, {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({ baseURL: apiURL });

/**
 * 文件下载不能经过统一 JSON 响应解包器，否则 Blob 会被当成
 * `{ code, data }` 解析并报告“接口请求失败”。这里只保留认证请求头。
 */
export const downloadRequestClient = new RequestClient({
  baseURL: apiURL,
  responseReturn: 'body',
});
downloadRequestClient.addRequestInterceptor({
  fulfilled: async (config) => {
    const accessStore = useAccessStore();
    config.headers.Authorization = formatToken(accessStore.accessToken);
    config.headers['Accept-Language'] = preferences.app.locale;
    config.headers['X-Request-Id'] ||= createRequestId();
    return config;
  },
});

// 下载接口仍需把 AxiosResponse 解包为 response.data，页面拿到的才是 Blob。
// `responseReturn: 'body'` 会直接返回响应体，不会执行普通业务接口的
// `{ code, data }` 数据结构校验。
downloadRequestClient.addResponseInterceptor(
  defaultResponseInterceptor({
    codeField: 'code',
    dataField: 'data',
    successCode: 0,
  }),
);
