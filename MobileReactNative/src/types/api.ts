import type {RewardMilestoneProgress} from './generated/reward.generated';
import type {ProductModules} from '../config/modules';

export type RewardMilestone = RewardMilestoneProgress;

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}
export interface AuthUser {
  id: string;
  phone: string;
  nickname: string;
  avatarUrl?: string | null;
  gender?: 'unknown' | 'male' | 'female';
  birthday?: string | null;
  bio?: string | null;
  coinBalance?: string | number;
  frozenCoinBalance?: string | number;
}

export interface RewardLedger {
  id: string;
  type: 'AD' | 'INVITE' | 'SIGNIN' | 'TASK' | 'WITHDRAW' | 'ADJUSTMENT' | string;
  amount: string | number;
  balanceAfter: string | number;
  title: string;
  createdAt: string;
}

export interface WithdrawalConfig {
  enabled: boolean;
  minCoins: string | number;
  maxCoins: string | number;
  tiers: Array<string | number>;
  coinsPerCent: number;
  feeRateBps: number;
  dailyCountLimit: number;
  dailyCoinLimit: string | number;
}
export interface PayoutAccount {
  bound: boolean;
  channel?: 'ALIPAY' | 'WECHAT' | 'BANK';
  accountMasked?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface WithdrawalRecord {
  id: string;
  coins: string | number;
  amountCents: number;
  feeCents: number;
  actualCents: number;
  channel: 'ALIPAY' | 'WECHAT' | 'BANK';
  accountMasked: string;
  status: 'PENDING' | 'REJECTED' | 'PAYING' | 'COMPLETED' | 'FAILED';
  reviewRemark?: string | null;
  paymentReference?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface WithdrawalCreateResult extends WithdrawalRecord { duplicate: boolean }
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export type RiskContext = 'login' | 'reward' | 'withdrawal';
export type RiskCheckStatus = 'PASS' | 'RISK' | 'UNKNOWN';
export interface RiskChallenge {
  id: string;
  context: RiskContext;
  nonce: string;
  expiresAt: string;
}
export interface RiskAssessmentStatus {
  context: RiskContext;
  fresh: boolean;
  required: boolean;
  expiresAt?: string | null;
  latest?: {id: string; score: number; knownChecks: number; autoBanned: boolean; createdAt: string} | null;
}
export interface RiskAssessmentResult {
  id: string;
  score: number;
  knownChecks: number;
  eligibleForDecision: boolean;
  autoBanned: boolean;
  checks: Record<string, RiskCheckStatus>;
  nearbyDeviceCount?: number | null;
  nearbyRadiusMeters?: number;
  presenceWindowMinutes?: number;
  deviceAccountCount: number;
  ipAccountCount: number;
}
export interface Drama {
  id: string;
  externalId: string;
  provider: 'PANGLE' | 'LOCAL';
  title: string;
  description?: string | null;
  coverUrl: string;
  category: string;
  totalEpisodes: number;
  tags?: string[];
  episodes?: Array<{id: string; episodeNo: number; title: string; durationSec: number}>;
}
export interface DramaCategory {
  id: number;
  name: string;
  parent: string;
}
export interface OperationSlot {
  id: string;
  placement: 'HOME_BANNER' | 'HOME_RECOMMEND' | 'STARTUP_POPUP';
  title: string;
  imageUrl: string;
  targetType: 'NONE' | 'DRAMA' | 'INTERNAL' | 'EXTERNAL';
  targetValue?: string | null;
}
export interface AppBootstrap {
  slots: OperationSlot[];
  announcements: Array<{id: string; title: string; content: string; createdAt?: string}>;
  configs: Record<string, unknown>;
  modules: ProductModules;
}
export interface AdRuntimeConfig {
  enabled: boolean;
  splash: {enabled: boolean; placementId: string; timeoutMs: number; safetyTimeoutMs: number};
  feed: {enabled: boolean; placementId: string; insertEvery: number};
  fullScreen: {
    enabled: boolean; placementId: string; playbackThreshold: number;
    minimumIntervalMinutes: number; loadTimeoutMs: number; showTimeoutMs: number;
  };
  reward: {enabled: boolean; placementId: string};
  drama: {
    unlockMode: 'COMMON' | 'SPECIFIC';
    freeEpisodes: number;
    unlockEpisodes: number;
    continuousUnlock: boolean;
    hideRewardDialog: boolean;
    hideCellularToast: boolean;
    hideLikeButton: boolean;
    hideFavorButton: boolean;
    hideDoubleClick: boolean;
    hideLongClickSpeed: boolean;
    infiniteScrollEnabled: boolean;
  };
}
export interface AdClientEvent {
  format: 'SPLASH' | 'FEED' | 'FULL_SCREEN' | 'REWARD' | 'DRAMA_UNLOCK';
  eventType: 'REQUEST' | 'LOADED' | 'SHOW' | 'CLICK' | 'CLOSE' | 'FAIL' | 'DISLIKE' | 'ECPM' | 'REWARD_ARRIVED';
  placementId: string;
  requestId?: string;
  creativeId?: string;
  adnName?: string;
  ecpm?: string;
  errorMessage?: string;
}
export interface VerifiedAdImpression {
  format: 'SPLASH' | 'FEED' | 'FULL_SCREEN';
  placementId: string;
  slotId: string;
  requestId: string;
  ecpm: string;
  rsInfo: string;
  adnName?: string;
}
export interface Favorite {
  id: string;
  dramaId: string;
  createdAt: string;
  drama: Drama;
}
export interface WatchHistory {
  id: string;
  dramaId: string;
  positionSeconds: number;
  updatedAt: string;
  drama: Drama;
  episode?: { id: string; episodeNo: number; title?: string };
}
export interface SdkLibrarySyncInput {
  requestId: string;
  favoritesAdded: string[];
  favoritesRemoved: string[];
  histories: Array<{externalId: string; episodeIndex: number; watchedAt?: string}>;
}
export interface Feedback {
  id: string;
  type: string;
  content: string;
  contact?: string;
  status: 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';
  reply?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  history: Array<{status: string; createdAt: string}>;
}
export interface UserReport {
  id: string;
  type: string;
  targetType: string;
  targetId?: string;
  content: string;
  status: 'PENDING' | 'PROCESSING' | 'VALID' | 'INVALID' | 'CLOSED';
  disposition?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  history: Array<{status: string; createdAt: string}>;
}
export interface AppDocument {
  id: string;
  code: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  content: string;
  type: 'SYSTEM' | 'REWARD' | 'WITHDRAWAL' | 'PROMOTION' | string;
  createdAt: string;
  readAt?: string | null;
}

export interface AppVersionRelease {
  id: string;
  platform: 'ANDROID' | 'IOS';
  versionName: string;
  versionCode: number;
  minVersionCode: number;
  downloadUrl: string;
  releaseNotes: string;
  rolloutPercent: number;
  publishedAt?: string | null;
}

export type AppVersionCheck =
  | {hasUpdate: false}
  | {hasUpdate: true; force: boolean; release: AppVersionRelease};

/** 福利中心接口返回值。金额和金币由服务端以字符串或数字形式序列化。 */
export interface RewardCenter {
  inviteCode: string;
  invitedCount: number;
  invitedCountToday: number;
  checkedInToday: boolean;
  streak: number;
  rewardedAdCountToday: number;
  rewardedAdDailyLimit: number;
  rewardedVideoRewardEnabled: boolean;
  dramaUnlockRewardEnabled: boolean;
  rewardedAdMilestones: RewardMilestone[];
  inviteMilestones: RewardMilestone[];
  inviteRewards: {
    INVITE_DIRECT?: {amount: string | number; enabled: boolean};
    INVITE_INDIRECT?: {amount: string | number; enabled: boolean};
  };
  signInRules: Array<{
    code: string;
    amount: string | number;
    enabled: boolean;
  }>;
  goldenWatch: GoldenWatchStatus;
}

export interface InviteRelationMember {
  userNo: string;
  nickname: string;
  phone: string;
}

export interface InviteRelations {
  parent: (InviteRelationMember & {boundAt: string}) | null;
  children: {
    list: Array<InviteRelationMember & {registeredAt: string; level: 'DIRECT' | 'INDIRECT'}>;
    total: number;
    directTotal: number;
    indirectTotal: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

export interface GoldenWatchStatus {
  enabled: boolean;
  active: boolean;
  periods: Array<{start: string; end: string}>;
  requiredSeconds: number;
  watchedSeconds: number;
  remainingSeconds: number;
  completedToday: boolean;
  completedAt?: string | null;
  rewardCoins: string | number;
}

export interface GoldenWatchProgressResult extends GoldenWatchStatus {
  awardedCoins: string | number;
  coinBalance: string | number | null;
}

export interface CheckInResult {
  awardedCoins: string | number;
  coinBalance: string | number;
  duplicate: boolean;
  record: {date: string; reward: string | number; streak: number};
}

export type AdRewardStatus =
  | {status: 'PENDING'; updatedAt?: string}
  | {status: 'FAILED'; message: string; updatedAt?: string}
  | {
      status: 'VERIFIED';
      transactionId?: string;
      coinBalance: string | number;
      updatedAt?: string;
    }
  | {
      status: 'SETTLED';
      settlementId: string;
      transactionId?: string;
      awardedCoins: string | number;
      adAwardedCoins?: string | number;
      milestoneBonusCoins?: string | number;
      countedForTask?: boolean;
      coinBalance: string | number;
      settledAt: string;
    };
