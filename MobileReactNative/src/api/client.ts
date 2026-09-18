import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, {AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig} from 'axios';
import {appConfig} from '../config/app-config';
import type {ApiEnvelope, AuthResult, AuthUser} from '../types/api';
import {ApiError, isAuthenticationError, isTransportError, toApiError} from './api-error';
import {setApiNetworkStatus} from './network-status';

export const API_ORIGIN = appConfig.apiOrigin;
export const API_BASE_URL = appConfig.apiBaseUrl;

/** 将后端保存的相对资源路径转换为当前设备可访问的完整地址。 */
export function resolveAssetUrl(value?: null | string) {
  if (!value || /^(?:https?:|data:|file:)/i.test(value)) return value ?? '';
  return `${API_ORIGIN}${value.startsWith('/') ? value : `/${value}`}`;
}

const ACCESS_KEY = 'hly_access_token_v1';
const REFRESH_KEY = 'hly_refresh_token_v1';
const USER_KEY = 'hly_auth_user_v1';
const DEVICE_KEY = 'hly_device_id_v1';
const INSTALLATION_KEY = 'hly_installation_id_v1';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_SAFE_RETRIES = 2;

type SessionTokens = Pick<AuthResult, 'accessToken' | 'refreshToken'>;
type RetryableConfig = InternalAxiosRequestConfig & {
  _authRetried?: boolean;
  _retryCount?: number;
};

let refreshing: Promise<string> | null = null;
let installationIdPromise: Promise<string> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export const http = axios.create({baseURL: API_BASE_URL, timeout: 20000});

function createRequestId() {
  return `rn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAuthEntryRequest(url?: string) {
  return ['/auth/login', '/auth/register', '/auth/admin-login', '/auth/refresh']
    .some(path => url?.startsWith(path));
}

function retryDelay(error: AxiosError, attempt: number) {
  const retryAfter = Number(error.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 3000);
  }
  return attempt === 1 ? 350 : 900;
}

http.interceptors.request.use(async config => {
  const [token, deviceId, installationId] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(DEVICE_KEY),
    getInstallationId(),
  ]);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (deviceId) config.headers['X-Device-Id'] = deviceId;
  config.headers['X-Installation-Id'] = installationId;
  config.headers['X-Platform'] = 'react-native';
  config.headers['X-App-Version'] = appConfig.versionName;
  config.headers['X-App-Version-Code'] = String(appConfig.versionCode);
  config.headers['X-Request-Id'] ||= createRequestId();
  return config;
});

async function refreshAccessToken() {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
      if (!refreshToken) {
        throw new ApiError({kind: 'auth', message: '登录已失效，请重新登录', status: 401});
      }
      const response = await axios.post<ApiEnvelope<SessionTokens>>(
        `${API_BASE_URL}/auth/refresh`,
        {refreshToken},
        {headers: {'X-Request-Id': createRequestId()}, timeout: 20000},
      );
      if (response.data.code !== 0) {
        throw new ApiError({
          code: response.data.code,
          kind: 'auth',
          message: response.data.message,
          requestId: response.data.requestId,
          status: response.status,
        });
      }
      await saveSession(response.data.data);
      return response.data.data.accessToken;
    })()
      .catch(async error => {
        const normalized = toApiError(error);
        if (isAuthenticationError(normalized)) {
          await clearSession();
          sessionExpiredHandler?.();
        }
        throw normalized;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

http.interceptors.response.use(
  response => {
    setApiNetworkStatus('online');
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    if (error.response) setApiNetworkStatus('online');

    if (
      error.response?.status === 401 &&
      config &&
      !config._authRetried &&
      !isAuthEntryRequest(config.url)
    ) {
      config._authRetried = true;
      config.headers.Authorization = `Bearer ${await refreshAccessToken()}`;
      return http.request(config);
    }

    const normalized = toApiError(error);
    const method = String(config?.method || 'GET').toUpperCase();
    const retryCount = config?._retryCount ?? 0;
    const retryLimit = normalized.kind === 'timeout' ? 1 : MAX_SAFE_RETRIES;
    if (
      config &&
      SAFE_METHODS.has(method) &&
      normalized.retryable &&
      retryCount < retryLimit
    ) {
      config._retryCount = retryCount + 1;
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), retryDelay(error, config._retryCount!));
      });
      return http.request(config);
    }

    if (isTransportError(normalized)) setApiNetworkStatus('offline');
    throw normalized;
  },
);

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

export async function saveSession(result: SessionTokens & {user?: AuthUser}) {
  const writes: Promise<void>[] = [
    AsyncStorage.setItem(ACCESS_KEY, result.accessToken),
    AsyncStorage.setItem(REFRESH_KEY, result.refreshToken),
  ];
  if (result.user) writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user)));
  await Promise.all(writes);
}

export async function saveCachedUser(user: AuthUser) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getCachedUser(): Promise<AuthUser | null> {
  const value = await AsyncStorage.getItem(USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AuthUser;
  } catch {
    await AsyncStorage.removeItem(USER_KEY);
    return null;
  }
}

export async function clearSession() {
  await Promise.all([
    AsyncStorage.removeItem(ACCESS_KEY),
    AsyncStorage.removeItem(REFRESH_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}

export async function hasSession() {
  const [accessToken, refreshToken] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
  ]);
  return Boolean(accessToken && refreshToken);
}

/** 保存原生生成的哈希设备标识，供后续登录日志和服务端关联分析使用。 */
export async function saveDeviceId(deviceId: string) {
  await AsyncStorage.setItem(DEVICE_KEY, deviceId);
}

/** 版本灰度使用随机安装标识，不依赖登录、电话权限或 Android ID。 */
export function getInstallationId() {
  if (!installationIdPromise) {
    installationIdPromise = (async () => {
      const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
      if (existing) return existing;
      const random = Array.from({length: 4}, () => Math.random().toString(36).slice(2, 10)).join('');
      const created = `install-${Date.now().toString(36)}-${random}`;
      await AsyncStorage.setItem(INSTALLATION_KEY, created);
      return created;
    })().catch(error => {
      installationIdPromise = null;
      throw error;
    });
  }
  return installationIdPromise;
}

export async function apiRequest<T>(
  path: string,
  options: Pick<AxiosRequestConfig, 'method' | 'data' | 'headers'> = {},
) {
  const response = await http.request<ApiEnvelope<T>>({
    url: path,
    method: options.method || 'GET',
    data: options.data,
    headers: options.headers,
  });
  if (response.data.code !== 0) {
    throw new ApiError({
      code: response.data.code,
      kind: response.data.code >= 2001 && response.data.code <= 2008 ? 'auth' : 'business',
      message: response.data.message,
      requestId: response.data.requestId,
      status: response.status,
    });
  }
  return response.data.data;
}
