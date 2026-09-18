import { z } from "zod";

/** 穿山甲广告收入回调的内部统一格式；正式字段映射可在适配层单独调整。 */
export const pangleAdRevenueSchema = z.object({
  eventId: z.string().trim().min(8).max(100),
  userId: z.coerce.bigint().positive(),
  revenueYuan: z.string().trim().regex(/^\d+(\.\d{1,6})?$/, "广告收入必须是最多 6 位小数的人民币金额"),
  source: z.string().trim().min(1).max(30).default("PANGLE"),
});

/** GroMore 广告位维度激励回调参数，字段名必须保持平台规定的 snake_case。 */
export const groMoreRewardQuerySchema = z.object({
  user_id: z.coerce.bigint().positive(),
  trans_id: z.string().trim().min(1).max(100),
  reward_amount: z.coerce.number().int().nonnegative(),
  reward_name: z.string().trim().max(50).default("金币"),
  mediation_rit: z.string().trim().min(1).max(30),
  prime_rit: z.string().trim().max(30).optional(),
  adn_name: z.string().trim().max(50).optional(),
  ecpm: z.string().trim().regex(/^\d+(\.\d{1,6})?$/).optional(),
  extra: z.string().max(1000).optional(),
  sign: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
});

export type GroMoreRewardQuery = z.infer<typeof groMoreRewardQuerySchema>;
