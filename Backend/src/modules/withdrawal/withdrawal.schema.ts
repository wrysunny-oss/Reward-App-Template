import { z } from "zod";

export const createWithdrawalSchema = z.object({
  requestId: z.string().trim().min(8).max(64),
  coins: z.coerce.bigint().positive(),
});

/** 收款账户在设置页单独绑定，提现申请不再接收客户端提交的敏感账户字段。 */
export const payoutAccountSchema = z.object({
  channel: z.enum(["ALIPAY", "WECHAT", "BANK"]),
  account: z.string().trim().min(4).max(100),
  realName: z.string().trim().min(2).max(50),
});

export const withdrawalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "PAYING", "COMPLETED", "REJECTED", "FAILED"]).optional(),
  keyword: z.string().trim().max(100).optional(),
});

export const withdrawalIdSchema = z.object({ id: z.string().uuid() });
export const reviewWithdrawalSchema = z.object({ approved: z.boolean(), remark: z.string().trim().min(2).max(500) });
export const completeWithdrawalSchema = z.object({
  success: z.boolean(),
  remark: z.string().trim().min(2).max(500),
  paymentReference: z.string().trim().max(100).optional(),
}).refine((data) => !data.success || Boolean(data.paymentReference), {
  message: "确认打款成功时必须填写支付流水号",
  path: ["paymentReference"],
});
export const updateWithdrawalConfigSchema = z.object({
  enabled: z.boolean(),
  coinsPerCent: z.number().int().positive().max(1_000_000),
  tiers: z.array(z.coerce.string().trim().regex(/^[1-9]\d*$/, "提现档位必须是正整数金币数")).min(1).max(20),
  dailyCountLimit: z.number().int().positive().max(100),
  dailyCoinLimit: z.coerce.bigint().positive(),
  feeRateBps: z.number().int().min(0).max(10_000),
}).superRefine((data, context) => {
  const tiers = data.tiers.map(BigInt);
  if (new Set(data.tiers).size !== data.tiers.length) {
    context.addIssue({code: "custom", message: "提现档位不能重复", path: ["tiers"]});
  }
  if (tiers.some((tier, index) => index > 0 && tier <= tiers[index - 1]!)) {
    context.addIssue({code: "custom", message: "提现档位必须按从小到大排列", path: ["tiers"]});
  }
  if (tiers.some(tier => tier % BigInt(data.coinsPerCent) !== 0n)) {
    context.addIssue({code: "custom", message: "提现档位必须满足金币兑换比例", path: ["tiers"]});
  }
}).transform(data => ({
  ...data,
  minCoins: BigInt(data.tiers[0]!),
  maxCoins: BigInt(data.tiers[data.tiers.length - 1]!),
}));

export const createBatchSchema = z.object({
  requestId: z.string().trim().min(8).max(64),
  withdrawalIds: z.array(z.string().uuid()).min(1).max(500),
  remark: z.string().trim().max(500).optional(),
}).refine((data) => new Set(data.withdrawalIds).size === data.withdrawalIds.length, { message: "提现订单不能重复" });

export const batchIdSchema = z.object({ id: z.string().uuid() });
export const batchResultRowSchema = z.object({
  withdrawalId: z.string().uuid(),
  success: z.boolean(),
  paymentReference: z.string().trim().max(100).optional(),
  failureReason: z.string().trim().max(500).optional(),
}).refine((row) => row.success ? Boolean(row.paymentReference) : Boolean(row.failureReason), { message: "成功记录需要支付流水号，失败记录需要失败原因" });
export const batchResultsSchema = z.object({
  requestId: z.string().trim().min(8).max(64),
  rows: z.array(batchResultRowSchema).min(1).max(500),
}).refine((data) => new Set(data.rows.map((row) => row.withdrawalId)).size === data.rows.length, { message: "结果文件包含重复订单" });

export type WithdrawalListQuery = z.infer<typeof withdrawalListQuerySchema>;
