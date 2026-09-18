import { z } from "zod";

export const bindInviteSchema = z.object({
  inviteCode: z.string().trim().toUpperCase().min(6).max(12),
});

/** 自定义邀请码仅允许 6 至 12 位大写字母或数字。 */
export const updateInviteCodeSchema = z.object({
  inviteCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/, "邀请码必须为 6-12 位字母或数字"),
});

export const rewardListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const inviteRelationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** SDK 返回的交易号只作为当前用户结算状态查询键，并与回调接口保持同一长度约束。 */
export const adRewardStatusParamsSchema = z.object({
  transactionId: z.string().trim().min(1).max(100),
});

export const dramaUnlockAdIntentSchema = z.object({
  dramaId: z.string().trim().regex(/^[1-9]\d{0,99}$/),
  episodeIndex: z.number().int().min(1).max(100_000),
});

/** SDK 偶尔晚于关闭事件返回交易号，允许按广告开始时间补查当前用户结算。 */
export const latestAdRewardQuerySchema = z.object({
  after: z.coerce.date(),
  format: z.enum(["REWARD", "DRAMA_UNLOCK"]).default("REWARD"),
});

/** 非激励广告只能携带穿山甲加密 eCPM 凭证进行服务端结算。 */
export const verifiedAdImpressionSchema = z.object({
  format: z.enum(["SPLASH", "FEED", "FULL_SCREEN"]),
  placementId: z.string().trim().regex(/^\d{6,20}$/),
  slotId: z.string().trim().min(1).max(100),
  requestId: z.string().trim().min(8).max(100),
  ecpm: z.string().trim().regex(/^\d{1,10}(\.\d{1,6})?$/),
  rsInfo: z.string().trim().min(32).max(4096),
  adnName: z.string().trim().max(50).optional(),
});

export const goldenWatchProgressSchema = z.object({
  externalId: z.string().trim().regex(/^[1-9]\d{0,99}$/),
  episodeIndex: z.number().int().min(1).max(100_000),
  sessionId: z.string().uuid(),
  elapsedSeconds: z.number().int().min(1).max(24 * 60 * 60),
});

export const rewardRuleCodeSchema = z.object({ code: z.string().trim().min(1).max(50) });
export const updateRewardRuleSchema = z.object({
  amount: z.coerce.bigint().min(0n),
  enabled: z.boolean(),
});

export type RewardListQuery = z.infer<typeof rewardListQuerySchema>;
export type InviteRelationsQuery = z.infer<typeof inviteRelationsQuerySchema>;
export type AdRewardStatusParams = z.infer<typeof adRewardStatusParamsSchema>;
export type LatestAdRewardQuery = z.infer<typeof latestAdRewardQuerySchema>;
export type VerifiedAdImpressionInput = z.infer<typeof verifiedAdImpressionSchema>;
export type GoldenWatchProgressInput = z.infer<typeof goldenWatchProgressSchema>;
