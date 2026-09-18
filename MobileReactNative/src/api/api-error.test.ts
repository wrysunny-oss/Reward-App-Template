import {isAuthenticationError, toApiError} from './api-error';

describe('API error normalization', () => {
  test('keeps backend request id for support tracing', () => {
    const error = toApiError({
      isAxiosError: true,
      response: {
        data: {code: 1503, message: '数据库暂不可用', requestId: 'request-123'},
        headers: {},
        status: 503,
      },
    });
    expect(error.kind).toBe('server');
    expect(error.retryable).toBe(true);
    expect(error.requestId).toBe('request-123');
    expect(error.message).toContain('问题编号：request-123');
  });

  test('distinguishes authentication failures from transport failures', () => {
    const authError = toApiError({
      isAxiosError: true,
      response: {data: {code: 2002, message: '登录已过期'}, headers: {}, status: 401},
    });
    const networkError = toApiError({isAxiosError: true, message: 'Network Error'});
    expect(isAuthenticationError(authError)).toBe(true);
    expect(networkError.kind).toBe('network');
    expect(networkError.retryable).toBe(true);
  });
});
