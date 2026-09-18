import { z } from "zod";

export const notificationIdSchema = z.object({ id: z.coerce.bigint().positive() });

export const sendNotificationSchema = z.object({
  target: z.enum(["ALL", "USER"]),
  phone: z.string().trim().regex(/^1\d{10}$/, "请输入正确的用户手机号").optional(),
  type: z.enum(["SYSTEM", "REWARD", "WITHDRAWAL", "PROMOTION"]),
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(5000),
}).refine((data) => data.target !== "USER" || Boolean(data.phone), {
  message: "定向发送必须填写用户手机号",
  path: ["phone"],
});

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
