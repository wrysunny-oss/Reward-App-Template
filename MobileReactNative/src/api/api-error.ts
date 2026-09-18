import axios from 'axios';
import type {ApiEnvelope} from '../types/api';

export type ApiErrorKind = 'auth' | 'business' | 'network' | 'server' | 'timeout';

export class ApiError extends Error {
  readonly code?: number;
  readonly kind: ApiErrorKind;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(options: {
    code?: number;
    kind: ApiErrorKind;
    message: string;
    requestId?: string;
    retryable?: boolean;
    status?: number;
  }) {
    super(options.requestId ? `${options.message}\n问题编号：${options.requestId}` : options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.kind = options.kind;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!axios.isAxiosError(error)) {
    return new ApiError({
      kind: 'business',
      message: error instanceof Error ? error.message : '操作失败，请稍后重试',
    });
  }

  const status = error.response?.status;
  const body = error.response?.data as Partial<ApiEnvelope<unknown>> | undefined;
  const requestId = body?.requestId || String(error.response?.headers?.['x-request-id'] || '') || undefined;
  const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
  const isNetwork = !error.response && !isTimeout;
  const kind: ApiErrorKind = isTimeout
    ? 'timeout'
    : isNetwork
      ? 'network'
      : status === 401
        ? 'auth'
        : status && status >= 500
          ? 'server'
          : 'business';
  const fallback = isTimeout
    ? '请求超时，请稍后重试'
    : isNetwork
      ? '网络连接不可用，请检查网络后重试'
      : status && status >= 500
        ? '服务暂时不可用，请稍后重试'
        : '请求失败，请稍后重试';

  return new ApiError({
    code: typeof body?.code === 'number' ? body.code : undefined,
    kind,
    message: body?.message || fallback,
    requestId,
    retryable: isTimeout || isNetwork || (status ? RETRYABLE_STATUSES.has(status) : false),
    status,
  });
}

export function isAuthenticationError(error: unknown) {
  const normalized = toApiError(error);
  return normalized.kind === 'auth' || [2001, 2002, 2008].includes(normalized.code ?? -1);
}

export function isTransportError(error: unknown) {
  const kind = toApiError(error).kind;
  return kind === 'network' || kind === 'timeout';
}
