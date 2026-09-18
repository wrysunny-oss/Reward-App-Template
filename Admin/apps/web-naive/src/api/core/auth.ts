import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    phone?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
    refreshToken: string;
  }

  export interface RefreshTokenResult {
    accessToken: string;
    refreshToken: string;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>('/auth/admin-login', data);
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  const { useAccessStore } = await import('@vben/stores');
  const refreshToken = useAccessStore().refreshToken;
  const response = await baseRequestClient.post<{ data: AuthApi.RefreshTokenResult }>(
    '/auth/refresh',
    { refreshToken },
    {
      withCredentials: true,
    },
  );
  return response.data;
}

/**
 * 退出登录
 */
export async function logoutApi() {
  const { useAccessStore } = await import('@vben/stores');
  const refreshToken = useAccessStore().refreshToken;
  if (!refreshToken) return Promise.resolve();
  return requestClient.post('/auth/logout', { refreshToken });
}

/** 修改当前管理员密码。 */
export const changePasswordApi = (data: { newPassword: string; oldPassword: string }) => requestClient.put('/auth/password', data);

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/admin/access-codes');
}
