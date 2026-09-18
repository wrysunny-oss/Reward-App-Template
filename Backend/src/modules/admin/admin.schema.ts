import { z } from "zod";
import { updateAdRewardConfigBaseSchema } from "../../contracts/reward.generated.js";

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(100).optional(),
});
export const userIdSchema = z.object({ id: z.coerce.bigint().positive() });
export const updateUserStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });
/** 后台创建代理无需上级邀请码，但必须提供可登录的基础账号信息。 */
export const createLevelOneAgentSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/, "请输入正确的手机号"),
  nickname: z.string().trim().min(1).max(50),
  password: z.string().min(8).max(72),
  agentShareRateBps: z.number().int().min(0).max(10_000),
});
/** null 表示用户继承全局分成，整数使用万分比存储。 */
export const updateUserAdShareSchema = z.object({
  shareRateBps: z.number().int().min(0).max(10_000).nullable(),
});
/** 仅管理员可调整代理无限下级佣金比例，整数 10000 表示 100%。 */
export const updateAgentShareRateSchema = z.object({
  agentShareRateBps: z.number().int().min(0).max(10_000),
});
export const updateAdRewardConfigSchema = updateAdRewardConfigBaseSchema.superRefine((value, context) => {
  if (value.directShareRateBps + value.indirectShareRateBps > 10_000) {
    context.addIssue({ code: "custom", message: "直推和间推返佣比例合计不能超过 100%" });
  }
  const adKeys = value.rewardedAdMilestones.map((item) => `${item.period}:${item.count}`);
  if (new Set(adKeys).size !== adKeys.length) {
    context.addIssue({ code: "custom", path: ["rewardedAdMilestones"], message: "同一周期和观看次数只能配置一个阶梯奖励" });
  }
  if (value.rewardedAdMilestones.some((item) => item.period === "DAILY" && item.count > value.dailyRewardedAdLimit)) {
    context.addIssue({ code: "custom", path: ["rewardedAdMilestones"], message: "阶梯观看次数不能超过每日激励广告上限" });
  }
  const inviteKeys = value.inviteMilestones.map((item) => `${item.period}:${item.count}`);
  if (new Set(inviteKeys).size !== inviteKeys.length) {
    context.addIssue({ code: "custom", path: ["inviteMilestones"], message: "同一周期和邀请人数只能配置一个阶梯奖励" });
  }
});
/** 人民币收入最多支持 6 位小数，避免浮点数进入财务计算。 */
export const settleAdRewardSchema = z.object({
  requestId: z.string().trim().min(8).max(100),
  userId: z.coerce.bigint().positive(),
  revenueYuan: z.string().trim().regex(/^\d+(\.\d{1,6})?$/, "广告收入必须是最多 6 位小数的人民币金额"),
  source: z.string().trim().min(1).max(30).default("PANGLE"),
  format: z.enum(["SPLASH", "FEED", "FULL_SCREEN", "REWARD", "DRAMA_UNLOCK"]).default("REWARD"),
});
export const adSettlementListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.coerce.bigint().positive().optional(),
});
export const ledgerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.coerce.bigint().positive().optional(),
});
export const adjustCoinsSchema = z.object({
  amount: z.coerce.bigint().refine((value) => value !== 0n, "调整数量不能为 0"),
  reason: z.string().trim().min(2).max(100),
});
export const roleIdSchema = z.object({ id: z.coerce.number().int().positive() });
export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.number().int().positive()).max(200),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;
