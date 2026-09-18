import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError, ok } from "../../lib/http.js";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/request.js";
import { uploadLimiter } from "../../middleware/rate-limit.js";
import { changePasswordSchema, credentialsSchema, refreshSchema, registerSchema, sendRegistrationSmsSchema, updateProfileSchema } from "./auth.schema.js";
import { revokeRefreshToken, rotateRefreshToken } from "../../services/token.service.js";
import * as authService from "./auth.service.js";
import { imageUpload, removeStoredImage, storeImage } from "../../services/local-image-storage.js";
import { sendRegistrationCode } from "../../services/sms-verification.service.js";
import { requireProductModules } from "../../middleware/product-module.js";

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { code: 1008, message: "请求过于频繁，请稍后重试", data: null } });
const smsLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { code: 2013, message: "验证码发送过于频繁，请稍后重试", data: null } });

/** POST /register/sms-code：向未注册手机号发送一次注册验证码。 */
router.post("/register/sms-code", requireProductModules("smsRegistration"), smsLimiter, validate(sendRegistrationSmsSchema), async (req, res) => {
  return ok(res, await sendRegistrationCode(req.body.phone), "验证码已发送");
});

/** POST /register：注册 App 用户，可选绑定邀请码；成功返回令牌，公开接口。 */
router.post("/register", requireProductModules("smsRegistration"), authLimiter, validate(registerSchema), async (req, res) => {
  return ok(res, await authService.register(req.body), "注册成功", 201);
});

/** POST /login：使用手机号或后台账号加密码登录；成功返回访问令牌和刷新令牌。 */
router.post("/login", authLimiter, validate(credentialsSchema), async (req, res) => {
  return ok(res, await authService.login(req.body.phone, req.body.password, req));
});

/** POST /admin-login：后台专用登录入口，仅管理员和代理账号可以登录。 */
router.post("/admin-login", authLimiter, validate(credentialsSchema), async (req, res) => {
  return ok(res, await authService.login(req.body.phone, req.body.password, req, true));
});

/** POST /refresh：单次使用刷新令牌并轮换一组新令牌。 */
router.post("/refresh", authLimiter, validate(refreshSchema), async (req, res) => ok(res, await rotateRefreshToken(req.body.refreshToken)));
/** POST /logout：撤销指定刷新令牌，重复调用保持幂等。 */
router.post("/logout", validate(refreshSchema), async (req, res) => { await revokeRefreshToken(req.body.refreshToken); return ok(res, null, "已退出登录"); });
/** PUT /password：验证旧密码并修改当前账号密码，同时撤销所有刷新令牌。 */
router.put("/password", authenticate, validate(changePasswordSchema), async (req, res) => ok(res, await authService.changePassword(req.auth!.userId, req.body.oldPassword, req.body.newPassword), "密码修改成功"));

/** GET /me：读取当前登录用户的安全资料字段；需要 Bearer Token。 */
router.get("/me", authenticate, async (req, res) => {
  return ok(res, await authService.getProfile(req.auth!.userId));
});

/** PUT /me：更新当前用户昵称、性别、生日和简介；需要 Bearer Token。 */
router.put("/me", authenticate, validate(updateProfileSchema), async (req, res) =>
  ok(res, await authService.updateProfile(req.auth!.userId, req.body), "资料保存成功"),
);

/** POST /avatar：上传 5MB 以内头像并立即绑定当前用户；需要 Bearer Token。 */
router.post("/avatar", authenticate, uploadLimiter, imageUpload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(422, 2010, "请选择 JPEG、PNG、WebP 或 GIF 图片");
  const stored = await storeImage(req.file, "avatars");
  let result: Awaited<ReturnType<typeof authService.replaceAvatar>>;
  try {
    result = await authService.replaceAvatar(req.auth!.userId, stored.url);
  } catch (error) {
    await removeStoredImage(stored.url);
    throw error;
  }
  removeStoredImage(result.previousAvatarUrl).catch((error) => {
    console.error("清理旧头像失败", error);
  });
  return ok(res, result.profile, "头像上传成功", 201);
});

export default router;
