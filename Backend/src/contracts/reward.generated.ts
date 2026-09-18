// 此文件由 scripts/generate-contracts.mjs 自动生成，请勿手动修改。
import { z } from "zod";

export const rewardMilestonePeriodSchema = z.enum(["DAILY", "LIFETIME"]);

export const createRewardMilestoneSchema = (maxCount: number) => z.object({
  count: z.number().int().min(1).max(maxCount),
  rewardCoins: z.number().int().min(1).max(1000000000),
  period: rewardMilestonePeriodSchema,
});

export const updateAdRewardConfigBaseSchema = z.object({
  defaultShareRateBps: z.number().int().min(0).max(10000),
  directShareRateBps: z.number().int().min(0).max(10000),
  indirectShareRateBps: z.number().int().min(0).max(10000),
  dailyRewardedAdLimit: z.number().int().min(0).max(1000),
  splashRewardEnabled: z.boolean(),
  feedRewardEnabled: z.boolean(),
  fullScreenRewardEnabled: z.boolean(),
  rewardedVideoRewardEnabled: z.boolean(),
  dramaUnlockRewardEnabled: z.boolean(),
  rewardedAdMilestones: createRewardMilestoneSchema(1000).array().max(20),
  inviteMilestones: createRewardMilestoneSchema(1000000).array().max(20),
});

export type RewardMilestonePeriod = z.infer<typeof rewardMilestonePeriodSchema>;
export type RewardMilestoneDefinition = z.infer<ReturnType<typeof createRewardMilestoneSchema>>;
export type UpdateAdRewardConfig = z.infer<typeof updateAdRewardConfigBaseSchema>;
