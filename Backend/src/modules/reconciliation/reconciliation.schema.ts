import { z } from "zod";

/** 自动对账配置采用固定结构，避免任意 JSON 导致调度器运行异常。 */
export const reconciliationScheduleSchema = z.object({
  enabled: z.boolean(),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
  timezone: z.literal("Asia/Shanghai").default("Asia/Shanghai"),
});

export type ReconciliationSchedule = z.infer<typeof reconciliationScheduleSchema>;
