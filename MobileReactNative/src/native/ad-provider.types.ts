import type {EcpmInfo, RewardVerify} from 'react-native-playnest-unionad';

export type AdFormat = 'REWARD' | 'CONTENT_UNLOCK';

export interface RewardResult {
  completed: boolean;
  rewardArrived: boolean;
  skipped: boolean;
  transactionId: string;
  placementId: string;
  rewardAmount: number;
  rewardName: string;
  rewardType?: number;
  ecpm?: EcpmInfo | null;
}

export interface RewardLifecycle {
  onEcpm?: (value: EcpmInfo | null) => void;
  onRewardSignal?: (value: RewardVerify) => void;
}

export interface AdProvider {
  readonly name: 'none' | 'gromore' | 'taku';
  readonly available: boolean;
  readonly state: 'idle' | 'loading' | 'ready' | 'showing';
  initialize(): Promise<void>;
  showStartupSplash(): Promise<void>;
  showFullScreen(): Promise<boolean>;
  loadReward(userId: string, extra?: string, format?: AdFormat, lifecycle?: RewardLifecycle): Promise<void>;
  showReward(): Promise<RewardResult>;
  setRewardLifecycle(lifecycle?: RewardLifecycle): void;
  dispose(): void;
}
