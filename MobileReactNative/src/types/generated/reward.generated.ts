// 此文件由 scripts/generate-contracts.mjs 自动生成，请勿手动修改。
export type RewardMilestonePeriod = "DAILY" | "LIFETIME";

export interface RewardMilestoneDefinition {
  count: number;
  rewardCoins: number;
  period: RewardMilestonePeriod;
}

export interface UpdateAdRewardConfig {
  defaultShareRateBps: number;
  directShareRateBps: number;
  indirectShareRateBps: number;
  dailyRewardedAdLimit: number;
  splashRewardEnabled: boolean;
  feedRewardEnabled: boolean;
  fullScreenRewardEnabled: boolean;
  rewardedVideoRewardEnabled: boolean;
  dramaUnlockRewardEnabled: boolean;
  rewardedAdMilestones: RewardMilestoneDefinition[];
  inviteMilestones: RewardMilestoneDefinition[];
}

export interface RewardMilestoneProgress extends RewardMilestoneDefinition {
  progress: number;
  completed: boolean;
}
