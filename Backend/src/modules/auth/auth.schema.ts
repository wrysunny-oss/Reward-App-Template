import { z } from "zod";
import { productModules } from "../../generated/product.generated.js";

/**
 * 登录接口沿用 `phone` 字段以兼容 App，但允许后台使用固定账号 admin。
 * 登录密码最少 6 位；用户注册仍执行手机号及 8 位密码规则。
 */
export const credentialsSchema = z.object({
  phone: z.string().trim().refine((value) => value === "admin" || /^1\d{10}$/.test(value), "请输入正确的账号"),
  password: z.string().min(6).max(72),
});

export const registerSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/, "请输入正确的手机号"),
  smsCode: z.string().regex(/^\d{6}$/, "请输入 6 位短信验证码"),
  password: z.string().min(8).max(72),
  nickname: z.string().trim().min(1).max(50),
  inviteCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/, "邀请码必须为 6-12 位字母或数字").optional(),
}).superRefine((value, context) => {
  if (productModules.invitations && !value.inviteCode) {
    context.addIssue({ code: "custom", path: ["inviteCode"], message: "请输入邀请码" });
  }
});
export const sendRegistrationSmsSchema = z.object({
  phone: z.string().trim().regex(/^1\d{10}$/, "请输入正确的手机号"),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20) });
/** App 用户可修改的公开资料；空生日会被转换为 null。 */
export const updateProfileSchema = z.object({
  nickname: z.string().trim().min(1).max(50),
  gender: z.enum(["unknown", "male", "female"]).optional(),
  birthday: z.union([z.string().date(), z.literal("")]).optional(),
  bio: z.string().trim().max(500).optional(),
});
export const changePasswordSchema = z.object({ oldPassword: z.string().min(6).max(72), newPassword: z.string().min(8).max(72) }).refine((data) => data.oldPassword !== data.newPassword, { message: "新密码不能与旧密码相同", path: ["newPassword"] });
