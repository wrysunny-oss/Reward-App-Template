import type {
  AdRewardConfig,
  RewardMilestoneDefinition,
  UpdateAdRewardConfig,
} from './generated/reward.generated';

import { downloadRequestClient, requestClient } from '#/api/request';
import { requestSecondaryPassword } from '#/utils/secondary-verification';

export type {
  AdRewardConfig,
  RewardMilestoneDefinition,
  UpdateAdRewardConfig,
} from './generated/reward.generated';
export type RewardMilestone = RewardMilestoneDefinition;

/** 高风险操作验证完成后才发起请求，密码仅放入本次请求头。 */
function withSecondaryVerification<T>(send: (headers: Record<string, string>) => T) {
  return requestSecondaryPassword().then((password) =>
    send({ 'X-Confirm-Password': password }),
  );
}

export interface DashboardStats {
  coinsIssued: string;
  dramaStatusDistribution: Array<{ count: number; status: 'DRAFT' | 'OFFLINE' | 'PUBLISHED' }>;
  feedbackPending: number;
  latestReconciliation?: null | { issueCount: number; startedAt: string; status: 'FAILED' | 'PASSED' | 'RUNNING' };
  publishedDramas: number;
  reconciliationPending: number;
  today: {
    adRevenueMicros: string;
    adSettlements: number;
    awardedCoins: string;
    newUsers: number;
  };
  trend: Array<{
    adRevenueMicros: string;
    adSettlements: number;
    awardedCoins: string;
    date: string;
    newUsers: number;
  }>;
  userStatusDistribution: Array<{ count: number; status: 'ACTIVE' | 'DISABLED' }>;
  users: number;
}

export interface AdminUser {
  /** 仅代理登录查询成员时返回，表示该成员相对代理的邀请层级。 */
  agentDepth?: number;
  agentParentId?: string;
  adShareRateBps?: null | number;
  agentShareRateBps?: null | number;
  coinBalance: string;
  frozenCoinBalance: string;
  createdAt: string;
  id: string;
  nickname: string;
  phone: string;
  roles?: Array<{ role: { code: string; name: string } }>;
  status: 'ACTIVE' | 'DISABLED';
}

export interface AuditLog {
  action: string;
  createdAt: string;
  id: string;
  ip?: null | string;
  method: string;
  operatorId?: null | string;
  path: string;
  targetId?: null | string;
  targetType?: null | string;
}

export interface CoinLedger {
  amount: string;
  balanceAfter: string;
  createdAt: string;
  id: string;
  title: string;
  type: string;
  user: { nickname: string; phone: string };
  userId: string;
}

export interface Permission {
  code: string;
  id: number;
  module: string;
  name: string;
}

export interface Role {
  _count: { users: number };
  code: string;
  description?: null | string;
  id: number;
  isSystem: boolean;
  name: string;
  permissions: Array<{ permission: Permission }>;
}

export interface RewardRule {
  amount: string;
  code: string;
  description?: null | string;
  enabled: boolean;
  name: string;
  updatedAt: string;
}

export interface InviteRelation {
  createdAt: string;
  id: string;
  inviteCode: string;
  invitee: { nickname: string; phone: string };
  inviter: { nickname: string; phone: string };
}

export interface CheckInRecord {
  createdAt: string;
  date: string;
  id: string;
  reward: string;
  streak: number;
  user: { nickname: string; phone: string };
}

export type WithdrawalStatus = 'COMPLETED' | 'FAILED' | 'PAYING' | 'PENDING' | 'REJECTED';
export interface WithdrawalConfig {
  coinsPerCent: number;
  dailyCoinLimit: string;
  dailyCountLimit: number;
  enabled: boolean;
  feeRateBps: number;
  maxCoins: string;
  minCoins: string;
  tiers: string[];
}
export interface Withdrawal {
  accountMasked: string;
  actualCents: number;
  amountCents: number;
  channel: 'ALIPAY' | 'BANK' | 'WECHAT';
  coins: string;
  createdAt: string;
  feeCents: number;
  id: string;
  paymentReference?: null | string;
  reviewRemark?: null | string;
  status: WithdrawalStatus;
  user: { coinBalance: string; frozenCoinBalance: string; nickname: string; phone: string };
}
export interface WithdrawalDetail extends Withdrawal {
  account: string;
  realName: string;
}
export interface AlipayPayoutStatus {
  configured: boolean;
  missing: string[];
  mode: 'CERTIFICATE' | 'PUBLIC_KEY';
}
export interface AlipayPayoutActionResult {
  state: 'FAILED' | 'NEEDS_QUERY' | 'PROCESSING' | 'SUCCESS';
  result: {
    failureReason?: string;
    orderId?: string;
    outBizNo: string;
    payFundOrderId?: string;
    status: string;
    traceId?: string;
  };
  withdrawal: Withdrawal;
}
export interface OperationSlot {
  enabled: boolean; endAt?: null | string; id: string; imageUrl: string;
  placement: 'HOME_BANNER' | 'HOME_RECOMMEND' | 'STARTUP_POPUP'; sort: number;
  startAt?: null | string; targetType: 'CONTENT' | 'EXTERNAL' | 'INTERNAL' | 'NONE'; targetValue?: null | string; title: string;
}
export interface Announcement { content: string; createdAt?: string; endAt?: null | string; id: string; startAt?: null | string; status: 'DRAFT' | 'OFFLINE' | 'PUBLISHED'; title: string; updatedAt?: string; }
export interface SendNotificationInput { content:string; phone?:string; target:'ALL'|'USER'; title:string; type:'PROMOTION'|'REWARD'|'SYSTEM'|'WITHDRAWAL' }
export interface SystemConfig { description?: null | string; key: string; value: unknown; }
export interface AdRuntimeConfig {
  enabled: boolean;
  splash: { enabled: boolean; placementId: string; safetyTimeoutMs: number; timeoutMs: number };
  feed: { enabled: boolean; insertEvery: number; placementId: string };
  fullScreen: {
    enabled: boolean; loadTimeoutMs: number; minimumIntervalMinutes: number;
    placementId: string; playbackThreshold: number; showTimeoutMs: number;
  };
  reward: { enabled: boolean; placementId: string };
}
export interface ShortDramaRuntimeConfig {
  unlockMode: 'COMMON' | 'SPECIFIC'; freeEpisodes: number; unlockEpisodes: number;
  continuousUnlock: boolean; hideRewardDialog: boolean; hideCellularToast: boolean;
  hideLikeButton: boolean; hideFavorButton: boolean; hideDoubleClick: boolean;
  hideLongClickSpeed: boolean; infiniteScrollEnabled: boolean;
}
export interface AdEventSummary {
  since: string;
  events: Array<{ count: number; eventType: string; format: string }>;
}
export interface AppDocument { code: string; content: string; createdAt?: string; id: string; publishedAt?: null | string; status: 'DRAFT' | 'OFFLINE' | 'PUBLISHED'; title: string; updatedAt?: string; version: string; }
export interface AppVersion { downloadUrl: string; enabled: boolean; id: string; minVersionCode: number; platform: 'ANDROID' | 'IOS'; publishedAt?: null | string; releaseNotes: string; rolloutPercent: number; versionCode: number; versionName: string; }
export interface ContentCenterDrama {
  _count: { episodes: number; favorites: number; histories: number };
  category: string; coverUrl: string; externalEpisodeCount: number; externalId?: null | string;
  id: string; mappingStatus: 'INVALID' | 'NO_EPISODES' | 'READY' | 'READY_TO_VALIDATE';
  playbackMode: 'DIRECT_URL' | 'PANGLE_NATIVE_SDK'; provider: 'LOCAL' | 'PANGLE';
  status: 'DRAFT' | 'OFFLINE' | 'PUBLISHED'; title: string; updatedAt: string; viewCount: string;
  validation?: null | {
    abi?: null | string; appVersion?: null | string; deviceModel?: null | string;
    playbackStartedAt?: null | string; requestSucceededAt?: null | string; sdkVersion?: null | string;
  };
}
export interface ContentCenterResult {
  list: ContentCenterDrama[]; page: number; pageSize: number; total: number;
  summary: { invalidMappings: number; latestPangleSyncAt?: null | string; pangle: number; published: number; total: number; validatedPangle: number };
}
export type SdkHealthStatus = 'ERROR' | 'HEALTHY' | 'UNKNOWN' | 'WARNING';
export interface SdkHealth {
  callback24h: Record<string, number>; checkedAt: string; overall: 'DEGRADED' | 'HEALTHY' | 'WARNING';
  checks: Array<{ code: string; detail: string; name: string; status: SdkHealthStatus }>;
  latestCallback?: null | { createdAt: string; reason?: null | string; status: string };
}
export interface ContentProbeResult { categoryCount: number; checkedAt: string; latencyMs: number; message?: string; status: 'ERROR' | 'HEALTHY' }
export interface TicketHistory { createdAt:string; status:string }
export interface FeedbackTicket { contact?:null|string; content:string; createdAt:string; history:TicketHistory[]; id:string; internalNote?:null|string; reply?:null|string; status:string; type:string; updatedAt:string; user?:{nickname:string;phone:string}; }
export interface UserReport { content:string; createdAt:string; disposition?:null|string; history:TicketHistory[]; id:string; remark?:null|string; status:string; targetId?:null|string; targetType:string; type:string; updatedAt:string; user:{nickname:string;phone:string}; }
export interface RiskEvent { createdAt:string; id:string; level:string; ruleCode:string; status:string; title:string; user?:null|{id:string;nickname:string;phone:string;riskStatus:string}; }
export interface RiskPolicy { enabled:boolean;requireFreshAssessment:boolean;minKnownChecks:number;autoBanThreshold:number;warningThreshold:number;nearbyRadiusMeters:number;nearbyDeviceThreshold:number;presenceWindowMinutes:number;maxLocationAccuracyMeters:number;maxLocationAgeSeconds:number;locationRetentionHours:number;loginValidityHours:number;rewardValidityMinutes:number;withdrawalValidityMinutes:number;multiAccountDeviceThreshold:number;multiAccountIpThreshold:number }
export type RiskCheckStatus = 'PASS' | 'RISK' | 'UNKNOWN';
export interface RiskRule {
  code: string;
  deduction: number;
  name: string;
  passCondition: string;
  riskCondition: string;
  source: string;
  unknownHandling: string;
}
export interface RiskBreakdown extends RiskRule {
  reason: string;
  status: RiskCheckStatus;
}
export interface RiskRuleCatalog {
  baseScore: number;
  decision: string;
  policy: RiskPolicy;
  rules: RiskRule[];
  scorePerRisk: number;
  totalChecks: number;
}
export interface DeviceRiskAssessment {
  alipayInstalled: boolean | null; autoBanned: boolean; breakdown: RiskBreakdown[];
  cloudDeviceDetected: boolean | null; context?: null | string; createdAt: string;
  deviceId: string; distanceMeters?: null | number; douyinInstalled: boolean | null;
  emulatorDetected: boolean | null; enforcementSuppressed?: boolean;
  evidence: Record<string, boolean | null | number | string>; id: string; ip?: null | string;
  ipTrusted: boolean | null; knownChecks: number; locationDistanceSafe: boolean | null;
  locationClusterSafe?: boolean | null; locationAccuracyMeters?: null | number; locationMock?: boolean | null;
  nearbyDeviceCount?: null | number; nearbyRadiusMeters?: null | number; presenceWindowMinutes?: null | number;
  networkTrusted: boolean | null; policy: RiskPolicy; policySource: 'CURRENT' | 'SNAPSHOT';
  score: number; scriptDetected: boolean | null; simPresent: boolean | null;
  user: { id: string; nickname: string; phone: string; riskStatus: string; status: string };
  wechatInstalled: boolean | null;
}
export interface RiskDashboard { totalAssessments:number;autoBanned:number;warningAssessments:number;pendingEvents:number;feedbackPending:number;reportPending:number;averageScore:number }
export interface ReconciliationIssue {
  actualAmount: string;
  difference: string;
  expectedAmount: string;
  id: string;
  type: 'AD_DISTRIBUTION' | 'AD_LEDGER' | 'AVAILABLE_COIN' | 'FROZEN_COIN';
  userId: string;
}
export interface ReconciliationRun {
  checkedUsers: number;
  completedAt?: null | string;
  errorMessage?: null | string;
  id: string;
  issueCount: number;
  issues: ReconciliationIssue[];
  source: 'MANUAL' | 'SCHEDULED';
  startedAt: string;
  status: 'FAILED' | 'PASSED' | 'RUNNING';
}
export interface WithdrawalBatchResultRow { failureReason?: string; paymentReference?: string; success: boolean; withdrawalId: string }
export interface WithdrawalBatch {
  batchNo: string; createdAt: string; id: string; orderCount: number; source?: string;
  status: 'CLOSED' | 'COMPLETED' | 'DRAFT' | 'EXPORTED' | 'PARTIAL' | 'PROCESSING'; totalCents: number;
  items: Array<{
    failureReason?: null | string;
    id: string;
    paymentReference?: null | string;
    status: 'FAILED' | 'PENDING' | 'SUCCESS';
    withdrawal: Withdrawal;
  }>;
}

/** 页面统一经由 API 层访问后端，避免组件中散落地址和响应类型。 */
export const getDashboardApi = () => requestClient.get<DashboardStats>('/admin/dashboard');
export const getUsersApi = (params: { keyword?: string; page: number; pageSize: number }) =>
  requestClient.get<{ list: AdminUser[]; page: number; pageSize: number; total: number }>('/admin/users', { params });
/** 管理员直接创建代理；不需要上级邀请码，创建操作要求二次密码验证。 */
export const createLevelOneAgentApi = (data: { agentShareRateBps: number; nickname: string; password: string; phone: string }) =>
  withSecondaryVerification((headers) =>
    requestClient.post<AdminUser & { inviteCode: string }>('/admin/users', data, { headers }),
  );
export const updateUserAdShareApi = (id: string, shareRateBps: null | number) =>
  withSecondaryVerification((headers) =>
    requestClient.put<{ adShareRateBps: null | number; id: string }>(`/admin/users/${id}/ad-share-rate`, { shareRateBps }, { headers }),
  );
export const updateAgentShareRateApi = (id: string, agentShareRateBps: number) =>
  withSecondaryVerification((headers) =>
    requestClient.put<{ agentShareRateBps: number; id: string }>(`/admin/users/${id}/agent-share-rate`, { agentShareRateBps }, { headers }),
  );
export const updateUserStatusApi = (id: string, status: AdminUser['status']) =>
  requestClient.request<AdminUser>(`/admin/users/${id}/status`, {
    data: { status },
    method: 'PATCH',
  });
export const getAuditLogsApi = () => requestClient.get<AuditLog[]>('/admin/audit-logs');
export const getUserDetailApi = (id: string) => requestClient.get<AdminUser & {
  _count: { favorites: number; histories: number; ledgers: number };
  bio?: null | string;
  roles: Array<{ role: { code: string; id: number; name: string } }>;
}>(`/admin/users/${id}`);
export const adjustUserCoinsApi = (id: string, data: { amount: string; reason: string }) =>
  withSecondaryVerification((headers) =>
    requestClient.post(`/admin/users/${id}/coin-adjustments`, data, { headers }),
  );
export const getCoinLedgersApi = (params: { page: number; pageSize: number; userId?: string }) =>
  requestClient.get<{ list: CoinLedger[]; page: number; pageSize: number; total: number }>('/admin/coin-ledgers', { params });
export const getPermissionsApi = () => requestClient.get<Permission[]>('/admin/permissions');
export const getRolesApi = () => requestClient.get<Role[]>('/admin/roles');
export const updateRolePermissionsApi = (id: number, permissionIds: number[]) =>
  withSecondaryVerification((headers) =>
    requestClient.put<Role>(`/admin/roles/${id}/permissions`, { permissionIds }, { headers }),
  );
export const getAdministratorsApi = () => requestClient.get<Array<AdminUser & { roles: Array<{ role: Role }> }>>('/admin/administrators');
export const getRewardRulesApi = () => requestClient.get<RewardRule[]>('/admin/reward-rules');
export interface AdRewardSettlement { id:string; requestId:string; userId:string; revenueMicros:string; baseUserCoins:string; awardedCoins:string; milestoneBonusCoins:string; directAwardedCoins:string; indirectAwardedCoins:string; commissionFunding:'PLATFORM_FUNDED'|'USER_DEDUCTED'; agentCommissions:Array<{id:string;depth:number;shareRateBps:number;awardedCoins:string;agent:{id:string;nickname:string;phone:string}}>; format:'CONTENT_UNLOCK'|'FEED'|'FULL_SCREEN'|'REWARD'|'SPLASH'; source:string; createdAt:string; user:{nickname:string;phone:string} }
export interface AdRewardDashboard { count:number; revenueMicros:string; grossEquivalentCoins:string; baseUserCoins:string; awardedCoins:string; milestoneBonusCoins:string; directAwardedCoins:string; indirectAwardedCoins:string; agentAwardedCoins:string; platformRetainedCoins:string }
export interface AgentOverview {
  ads: {
    month: { awardedCoins: string; count: number; revenueMicros: string };
    today: { awardedCoins: string; count: number; revenueMicros: string };
    total: { awardedCoins: string; count: number; revenueMicros: string };
  };
  commission: { count: number; month: string; today: string; total: string };
  members: { active30Days: number; today: number; total: number };
  ranking: Array<{ awardedCoins: string; count: number; revenueMicros: string; user?: { id: string; nickname: string; phone: string } }>;
  trend: Array<{ awardedCoins: string; count: number; date: string; revenueMicros: string }>;
}
export interface AdCallbackLog { id:string; eventId:string; status:'FAILED'|'PROCESSING'|'SUCCESS'; reason?:null|string; ip?:null|string; createdAt:string; updatedAt:string }
export interface AdCallbackSummary { success:number; failed:number; processing:number; staleProcessing:number }
export interface UserTeam { summary:{directCount:number;indirectCount:number;directCommissionCoins:string;indirectCommissionCoins:string;agentCommissionCoins:string;agentCommissionCount:number}; direct:Array<{createdAt:string;invitee:{id:string;nickname:string;phone:string;status:string}}>; indirect:Array<{createdAt:string;inviter:{id:string;nickname:string};invitee:{id:string;nickname:string;phone:string;status:string}}> }
/** 运营配置必须实时读取；时间戳同时绕过浏览器、CDN 和反向代理的旧 GET 缓存。 */
export const getAdRewardConfigApi = () => requestClient.get<AdRewardConfig>('/admin/ad-reward-config', {
  headers: { 'Cache-Control': 'no-cache' },
  params: { _t: Date.now() },
});
export const updateAdRewardConfigApi = (data: UpdateAdRewardConfig) =>
  withSecondaryVerification((headers) =>
    requestClient.put<AdRewardConfig>('/admin/ad-reward-config', data, { headers }),
  );
export const settleAdRewardApi = (data: { requestId: string; revenueYuan: string; source: string; userId: string }) =>
  withSecondaryVerification((headers) =>
    requestClient.post<{ awardedCoins: string }>('/admin/ad-reward-settlements', data, { headers }),
  );
export const getAdRewardSettlementsApi = (params:{page:number;pageSize:number;userId?:string}) => requestClient.get<{list:AdRewardSettlement[];page:number;pageSize:number;total:number}>('/admin/ad-reward-settlements',{params});
export const getAdRewardDashboardApi = () => requestClient.get<AdRewardDashboard>('/admin/ad-reward-dashboard');
/** 代理专属聚合接口，后端自动使用当前代理身份限定邀请树范围。 */
export const getAgentOverviewApi = () => requestClient.get<AgentOverview>('/admin/agent-overview');
export const getAdCallbackLogsApi = (params:{page:number;pageSize:number}) => requestClient.get<{list:AdCallbackLog[];page:number;pageSize:number;summary:AdCallbackSummary;total:number}>('/admin/ad-callback-logs',{params});
export const getUserTeamApi = (id:string) => requestClient.get<UserTeam>(`/admin/users/${id}/team`);
export const updateRewardRuleApi = (code: string, data: { amount: string; enabled: boolean }) =>
  requestClient.put<RewardRule>(`/admin/reward-rules/${code}`, data);
export const getInviteRelationsApi = (params: { page: number; pageSize: number }) =>
  requestClient.get<{ list: InviteRelation[]; page: number; pageSize: number; total: number }>('/admin/invite-relations', { params });
export const getCheckInsApi = (params: { page: number; pageSize: number }) =>
  requestClient.get<{ list: CheckInRecord[]; page: number; pageSize: number; total: number }>('/admin/check-ins', { params });
export const getWithdrawalsApi = (params: { keyword?: string; page: number; pageSize: number; status?: WithdrawalStatus }) =>
  requestClient.get<{ list: Withdrawal[]; page: number; pageSize: number; total: number }>('/admin/withdrawals', { params });
export const getWithdrawalDetailApi = (id: string) =>
  withSecondaryVerification((headers) =>
    requestClient.get<WithdrawalDetail>(`/admin/withdrawals/${id}`, { headers }),
  );
export const reviewWithdrawalApi = (id: string, data: { approved: boolean; remark: string }) =>
  withSecondaryVerification((headers) =>
    requestClient.post(`/admin/withdrawals/${id}/review`, data, { headers }),
  );
export const completeWithdrawalApi = (id: string, data: { paymentReference?: string; remark: string; success: boolean }) =>
  withSecondaryVerification((headers) =>
    requestClient.post(`/admin/withdrawals/${id}/complete`, data, { headers }),
  );
export const getAlipayPayoutStatusApi = () => requestClient.get<AlipayPayoutStatus>('/admin/alipay-payout/status');
export const payWithdrawalWithAlipayApi = (id: string) =>
  withSecondaryVerification((headers) =>
    requestClient.post<AlipayPayoutActionResult>(`/admin/withdrawals/${id}/alipay-transfer`, {}, { headers }),
  );
export const queryAlipayWithdrawalApi = (id: string) =>
  withSecondaryVerification((headers) =>
    requestClient.post<AlipayPayoutActionResult>(`/admin/withdrawals/${id}/alipay-query`, {}, { headers }),
  );
export const getWithdrawalConfigApi = () => requestClient.get<WithdrawalConfig>('/admin/withdrawal-config');
export const updateWithdrawalConfigApi = (data: WithdrawalConfig) =>
  withSecondaryVerification((headers) =>
    requestClient.put<WithdrawalConfig>('/admin/withdrawal-config', data, { headers }),
  );
export const getOperationSlotsApi = () => requestClient.get<OperationSlot[]>('/admin/operation-slots');
export const createOperationSlotApi = (data: Omit<OperationSlot, 'id'>) => requestClient.post<OperationSlot>('/admin/operation-slots', data);
export const updateOperationSlotApi = (id: string, data: Omit<OperationSlot, 'id'>) => requestClient.put<OperationSlot>(`/admin/operation-slots/${id}`, data);
export const deleteOperationSlotApi = (id: string) => requestClient.delete(`/admin/operation-slots/${id}`);
export const getAnnouncementsApi = () => requestClient.get<Announcement[]>('/admin/announcements');
export const createAnnouncementApi = (data: Omit<Announcement, 'id'>) => requestClient.post<Announcement>('/admin/announcements', data);
export const updateAnnouncementApi = (id: string, data: Omit<Announcement, 'id'>) => requestClient.put<Announcement>(`/admin/announcements/${id}`, data);
export const deleteAnnouncementApi = (id: string) => requestClient.delete(`/admin/announcements/${id}`);
export const sendNotificationApi = (data: SendNotificationInput) =>
  withSecondaryVerification((headers) => requestClient.post<{id:string;recipients:number}>('/admin/notifications', data, {headers}));
export const getSystemConfigsApi = () => requestClient.get<SystemConfig[]>('/admin/system-configs');
export const updateSystemConfigApi = (key: string, data: { description?: null | string; value: unknown }) => requestClient.put<SystemConfig>(`/admin/system-configs/${encodeURIComponent(key)}`, data);
export const getAdRuntimeConfigApi = () => requestClient.get<AdRuntimeConfig>('/admin/ad-runtime-config');
export const getAdEventSummaryApi = () => requestClient.get<AdEventSummary>('/admin/ad-events/summary');
export const getAppDocumentsApi = () => requestClient.get<AppDocument[]>('/admin/app-documents');
export const createAppDocumentApi = (data: Omit<AppDocument, 'id'>) => requestClient.post<AppDocument>('/admin/app-documents', data);
export const updateAppDocumentApi = (id: string, data: Omit<AppDocument, 'id'>) => requestClient.put<AppDocument>(`/admin/app-documents/${id}`, data);
export const getAppVersionsApi = () => requestClient.get<AppVersion[]>('/admin/app-versions');
export const createAppVersionApi = (data: Omit<AppVersion, 'id'>) => requestClient.post<AppVersion>('/admin/app-versions', data);
export const updateAppVersionApi = (id: string, data: Omit<AppVersion, 'id'>) => requestClient.put<AppVersion>(`/admin/app-versions/${id}`, data);
export const getContentCenterApi = (params: { keyword?: string; page: number; pageSize: number; provider?: string; status?: string }) =>
  requestClient.get<ContentCenterResult>('/admin/content-center', { params });
export const syncPangleContentApi = () => requestClient.post<{ hasMore: boolean; synced: number; total: number }>('/admin/content-center/sync');
export const getSdkHealthApi = () => requestClient.get<SdkHealth>('/admin/sdk-health');
export const probePangleContentApi = () => requestClient.post<ContentProbeResult>('/admin/sdk-health/content-probe');
/**
 * 运营图片必须使用 RequestClient 的上传通道。
 * 普通 post() 默认携带 application/json，Multer 无法从中读取 file 字段。
 */
export const uploadOperationImageApi = (file: File) => {
  return requestClient.upload<{ url: string }>('/admin/uploads/images', { file });
};
type SafetyListParams={page:number;pageSize:number;status?:string};
type SafetyListResult<T>={list:T[];page:number;pageSize:number;total:number};
export const getFeedbackTicketsApi=(params:SafetyListParams)=>requestClient.get<SafetyListResult<FeedbackTicket>>('/admin/feedback',{params:{page:params.page,pageSize:params.pageSize,status:params.status}});
export const handleFeedbackTicketApi=(id:string,data:{internalNote?:string;reply?:string;status:string})=>requestClient.put(`/admin/feedback/${id}`,data);
export const getReportsApi=(params:SafetyListParams)=>requestClient.get<SafetyListResult<UserReport>>('/admin/reports',{params:{page:params.page,pageSize:params.pageSize,status:params.status}});
export const handleReportApi=(id:string,data:{disposition?:string;remark?:string;status:string})=>requestClient.put(`/admin/reports/${id}`,data);
export const getRiskEventsApi=(params:SafetyListParams)=>requestClient.get<SafetyListResult<RiskEvent>>('/admin/risk-events',{params:{page:params.page,pageSize:params.pageSize,status:params.status}});
export const handleRiskEventApi=(id:string,data:{remark:string;status:'CONFIRMED'|'IGNORED'})=>requestClient.put(`/admin/risk-events/${id}`,data);
export const getDeviceRiskAssessmentsApi=(params:SafetyListParams)=>requestClient.get<SafetyListResult<DeviceRiskAssessment>>('/admin/device-risk-assessments',{params:{page:params.page,pageSize:params.pageSize,status:params.status}});
export const updateUserRiskApi=(id:string,data:{riskStatus:'BANNED'|'NORMAL';riskRemark:string})=>
  withSecondaryVerification((headers)=>requestClient.put(`/admin/users/${id}/risk`,data,{headers}));
export const getRiskPolicyApi=()=>requestClient.get<RiskPolicy>('/admin/risk-policy');
/** 风控规则说明由服务端返回，确保后台展示和实际扣分逻辑使用同一来源。 */
export const getRiskRulesApi=()=>requestClient.get<RiskRuleCatalog>('/admin/risk-rules');
export const updateRiskPolicyApi=(data:RiskPolicy)=>
  withSecondaryVerification((headers)=>requestClient.put<RiskPolicy>('/admin/risk-policy',data,{headers}));
export const getRiskDashboardApi=()=>requestClient.get<RiskDashboard>('/admin/risk-dashboard');
/** 获取最近的资金对账任务，返回每次任务的余额差异明细。 */
export const getReconciliationRunsApi = () =>
  requestClient.get<ReconciliationRun[]>('/admin/reconciliation-runs');
/** 立即执行一次只读对账；该操作只记录差异，不会修改用户余额。 */
export const runReconciliationApi = () =>
  requestClient.post<ReconciliationRun>('/admin/reconciliation-runs');
export interface ReconciliationSchedule { enabled: boolean; hour: number; minute: number; timezone: 'Asia/Shanghai' }
/** 获取自动对账开关与每日执行时间。 */
export const getReconciliationScheduleApi = () => requestClient.get<ReconciliationSchedule>('/admin/reconciliation-schedule');
/** 更新自动对账配置；后端会校验范围并记录审计日志。 */
export const updateReconciliationScheduleApi = (data: ReconciliationSchedule) => requestClient.put<ReconciliationSchedule>('/admin/reconciliation-schedule', data);
export const getFinanceDashboardApi = () => requestClient.get<{ abnormalBatches:number; byStatus:Array<{_count:number;_sum:{actualCents:null|number};status:WithdrawalStatus}>; timeoutCount:number; today:{cents:number;count:number} }>('/admin/finance-dashboard');
export const getWithdrawalBatchesApi = () => requestClient.get<WithdrawalBatch[]>('/admin/withdrawal-batches');
export interface AlipayBatchStartResult {
  batchId: string;
  mode: 'PAY' | 'QUERY';
  pending?: number;
  running: boolean;
  started: boolean;
}
export const startAlipayWithdrawalBatchApi = (id: string) =>
  withSecondaryVerification((headers) => requestClient.post<AlipayBatchStartResult>(`/admin/withdrawal-batches/${id}/alipay-pay`, {}, { headers }));
export const queryAlipayWithdrawalBatchApi = (id: string) =>
  withSecondaryVerification((headers) => requestClient.post<AlipayBatchStartResult>(`/admin/withdrawal-batches/${id}/alipay-query`, {}, { headers }));
export const createWithdrawalBatchApi = (data:{remark?:string;requestId:string;withdrawalIds:string[]}) =>
  withSecondaryVerification((headers) => requestClient.post<WithdrawalBatch>('/admin/withdrawal-batches', data, { headers }));
export const closeWithdrawalBatchApi = (id:string) =>
  withSecondaryVerification((headers) => requestClient.post<WithdrawalBatch>(`/admin/withdrawal-batches/${id}/close`,{}, { headers }));
export const previewWithdrawalBatchResultsApi = (id:string,data:{requestId:string;rows:WithdrawalBatchResultRow[]}) => requestClient.post<{invalid:number;rows:Array<WithdrawalBatchResultRow & {errors:string[];valid:boolean}>;total:number;valid:number}>(`/admin/withdrawal-batches/${id}/results/preview`,data);
export const confirmWithdrawalBatchResultsApi = (id:string,data:{requestId:string;rows:WithdrawalBatchResultRow[]}) =>
  withSecondaryVerification((headers) => requestClient.post<WithdrawalBatch>(`/admin/withdrawal-batches/${id}/results/confirm`,data,{headers}));
export const exportWithdrawalBatchApi = (id:string) =>
  withSecondaryVerification((headers) => downloadRequestClient.get<Blob>(`/admin/withdrawal-batches/${id}/export`,{
    headers:{...headers,'Cache-Control':'no-cache'},responseType:'blob',
  }));
