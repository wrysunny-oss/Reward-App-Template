import { apiRequest, resolveAssetUrl } from './client';
import type {
  AppDocument,
  AuthResult,
  AuthUser,
  Drama,
  Favorite,
  Feedback,
  UserReport,
  WatchHistory,
  RewardCenter,
  RewardLedger,
  WithdrawalConfig,
  WithdrawalCreateResult,
  WithdrawalRecord,
  PayoutAccount,
  RiskAssessmentResult,
  RiskAssessmentStatus,
  RiskChallenge,
  RiskContext,
  AppBootstrap,
  DramaCategory,
  AppVersionCheck,
  AppNotification,
  AdRewardStatus,
  CheckInResult,
  AdClientEvent,
  VerifiedAdImpression,
  AdRuntimeConfig,
  ShortDramaRuntimeConfig,
  GoldenWatchProgressResult,
  InviteRelations,
  SdkLibrarySyncInput,
} from '../types/api';
import {appConfig} from '../config/app-config';

/** 后端使用数据库大写枚举和相对资源路径，这里统一转换为 App 表单模型。 */
function normalizeUser(user: AuthUser): AuthUser {
  const rawGender = String(user.gender ?? 'unknown').toLowerCase();
  const gender: AuthUser['gender'] = ['male', 'female'].includes(rawGender)
    ? rawGender as 'male' | 'female'
    : 'unknown';
  return {
    ...user,
    avatarUrl: user.avatarUrl ? resolveAssetUrl(user.avatarUrl) : null,
    birthday: user.birthday ? String(user.birthday).slice(0, 10) : null,
    gender,
  };
}

function normalizeAuthResult(result: AuthResult): AuthResult {
  return {...result, user: normalizeUser(result.user)};
}

export const appApi = {
  login: (phone: string, password: string) =>
    apiRequest<AuthResult>('/auth/login', {
      method: 'POST',
      data: { phone, password },
    }).then(normalizeAuthResult),
  register: (data: {
    phone: string;
    smsCode: string;
    password: string;
    nickname: string;
    inviteCode?: string;
  }) => apiRequest<AuthResult>('/auth/register', { method: 'POST', data }).then(normalizeAuthResult),
  sendRegistrationSms: (phone: string) =>
    apiRequest<{resendAfter: number; expiresIn: number}>('/auth/register/sms-code', {
      method: 'POST',
      data: {phone},
    }),
  me: () => apiRequest<AuthUser>('/auth/me').then(normalizeUser),
  dramas: (params: {page?: number; pageSize?: number; categoryId?: number; keyword?: string} = {}) => {
    const query = new URLSearchParams({
      page: String(params.page ?? 1),
      pageSize: String(params.pageSize ?? 12),
    });
    if (params.categoryId) query.set('categoryId', String(params.categoryId));
    if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
    return apiRequest<{ list: Drama[]; total: number; hasMore: boolean }>(
      `/content/dramas?${query.toString()}`,
    );
  },
  dramaCategories: () => apiRequest<DramaCategory[]>('/content/categories'),
  /** 首页运营 Banner、推荐位、公告和功能配置的聚合接口。 */
  bootstrap: () => apiRequest<AppBootstrap>('/operations/bootstrap').then(result => ({
    ...result,
    slots: result.slots.map(slot => ({...slot, imageUrl: resolveAssetUrl(slot.imageUrl)})),
  })),
  adConfig: () => apiRequest<AdRuntimeConfig>('/operations/ad-config'),
  shortDramaConfig: () => apiRequest<ShortDramaRuntimeConfig>('/content/runtime-config'),
  adEvent: (data: AdClientEvent) => apiRequest<{accepted: boolean}>('/operations/ad-events', {method: 'POST', data}),
  verifiedAdImpression: (data: VerifiedAdImpression) =>
    apiRequest<{awardedCoins: string; format: string}>('/rewards/ad-rewards/verified-impression', {method: 'POST', data}),
  /** 获取签到状态、广告完成次数和后台配置的每日广告上限。 */
  rewardCenter: () => apiRequest<RewardCenter>('/rewards/center'),
  rewardLedgers: () =>
    apiRequest<{list: RewardLedger[]; total: number}>(
      '/rewards/ledgers?page=1&pageSize=100',
    ),
  checkIn: () => apiRequest<CheckInResult>('/rewards/check-ins', { method: 'POST' }),
  adRewardStatus: (transactionId: string) =>
    apiRequest<AdRewardStatus>(`/rewards/ad-rewards/${encodeURIComponent(transactionId)}/status`),
  dramaUnlockAdIntent: (data: {dramaId: string; episodeIndex: number}) =>
    apiRequest<{mediaExtra: string}>('/rewards/ad-rewards/drama-unlock-intent', {method: 'POST', data}),
  latestAdReward: (after: number, format: 'REWARD' | 'CONTENT_UNLOCK' = 'REWARD') =>
    apiRequest<AdRewardStatus>(`/rewards/ad-rewards/latest?after=${encodeURIComponent(new Date(after).toISOString())}&format=${format}`),
  goldenWatchProgress: (data: {externalId: string; episodeIndex: number; sessionId: string; elapsedSeconds: number}) =>
    apiRequest<GoldenWatchProgressResult>('/rewards/golden-watch/progress', {method: 'POST', data}),
  updateProfile: (data: {
    nickname: string;
    gender?: 'female' | 'male' | 'unknown';
    birthday?: string;
    bio?: string;
  }) => apiRequest<AuthUser>('/auth/me', { method: 'PUT', data }).then(normalizeUser),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiRequest('/auth/password', {
      method: 'PUT',
      data: { oldPassword, newPassword },
    }),
  uploadAvatar: (data: FormData) =>
    apiRequest<{ avatarUrl: string }>('/auth/avatar', {
      method: 'POST',
      data,
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(result => ({...result, avatarUrl: resolveAssetUrl(result.avatarUrl)})),
  withdrawalConfig: () => apiRequest<WithdrawalConfig>('/withdrawals/config'),
  payoutAccount: () => apiRequest<PayoutAccount>('/withdrawals/payout-account'),
  bindPayoutAccount: (accountName: string, accountNo: string) =>
    apiRequest<any>('/withdrawals/payout-account', {
      method: 'PUT',
      data: {channel: 'ALIPAY', realName: accountName, account: accountNo},
    }),
  withdrawals: () => apiRequest<{list: WithdrawalRecord[]; total: number}>('/withdrawals/mine?page=1&pageSize=100'),
  createWithdrawal: (coins: string, requestId: string) =>
    apiRequest<WithdrawalCreateResult>('/withdrawals', {
      method: 'POST',
      data: { coins, requestId },
    }),
  notifications: () => apiRequest<{list: AppNotification[]; total: number; unread: number}>('/notifications'),
  notificationUnreadCount: () => apiRequest<{count: number}>('/notifications/unread-count'),
  markNotificationRead: (id: string) => apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {method: 'PUT'}),
  markAllNotificationsRead: () => apiRequest('/notifications/read-all', {method: 'PUT'}),
  inviteInfo: () => apiRequest<any>('/rewards/center'),
  inviteRelations: (page = 1, pageSize = 20) =>
    apiRequest<InviteRelations>(`/rewards/invite/relations?page=${page}&pageSize=${pageSize}`),
  updateInviteCode: (inviteCode: string) =>
    apiRequest<any>('/rewards/invite-code', {
      method: 'PUT',
      data: { inviteCode },
    }),
  favorites: () => apiRequest<Favorite[]>('/library/favorites'),
  addFavorite: (dramaId: string) => apiRequest(`/library/favorites/${dramaId}`, {method: 'PUT'}),
  removeFavorite: (dramaId: string) =>
    apiRequest(`/library/favorites/${dramaId}`, { method: 'DELETE' }),
  history: () => apiRequest<WatchHistory[]>('/library/history'),
  syncSdkLibrary: (data: SdkLibrarySyncInput) => apiRequest<{duplicate: boolean; favoritesAdded: number; favoritesRemoved: number; historiesUpdated: number}>('/library/sdk-sync', {method: 'POST', data}),
  drama: (id: string) => apiRequest<Drama>(`/content/dramas/${id}`),
  feedback: () => apiRequest<Feedback[]>('/safety/feedback/mine'),
  submitFeedback: (data: { type: string; content: string; contact?: string }) =>
    apiRequest('/safety/feedback', { method: 'POST', data }),
  reports: () => apiRequest<UserReport[]>('/safety/reports/mine'),
  submitReport: (data: {type: string; targetType: string; targetId?: string; content: string}) =>
    apiRequest('/safety/reports', {method: 'POST', data}),
  /** 查询当前场景最近一次设备检测是否仍在后台配置的有效期内。 */
  riskAssessmentStatus: (context: RiskContext) =>
    apiRequest<RiskAssessmentStatus>(`/safety/device-risk-status?context=${context}`),
  /** 获取两分钟内有效、只能使用一次的原生设备检测挑战。 */
  createRiskChallenge: (context: RiskContext) =>
    apiRequest<RiskChallenge>('/safety/device-risk-challenges', {
      method: 'POST',
      data: {context},
    }),
  /** 提交原生信号；分数、IP 判断和处罚全部由服务端计算。 */
  submitRiskAssessment: (data: Record<string, unknown>) =>
    apiRequest<RiskAssessmentResult>('/safety/device-risk-assessments', {
      method: 'POST',
      data,
    }),
  /** APP 前台轻量位置心跳，不生成完整评分记录。 */
  updateDevicePresence: (data: {deviceId: string; location: {accuracyMeters: number; capturedAt: number; isMock: boolean; latitude: number; longitude: number}}) =>
    apiRequest<{accepted: boolean; expiresAt?: string; reason?: string}>('/safety/device-presence', {
      method: 'POST',
      data,
    }),
  document: (code: 'USER_AGREEMENT' | 'PRIVACY_POLICY' | 'HELP_CENTER') =>
    apiRequest<AppDocument>(`/operations/documents/${code}`),
  /** 公开版本接口；服务端按安装标识进行稳定灰度分桶。 */
  checkVersion: (installationId: string) => {
    const query = new URLSearchParams({
      platform: 'ANDROID',
      versionCode: String(appConfig.versionCode),
      deviceId: installationId,
    });
    return apiRequest<AppVersionCheck>(`/operations/version-check?${query.toString()}`);
  },
};
