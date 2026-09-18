import bcrypt from "bcryptjs";
import type { Request } from "express";
import { AppError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { issueTokens } from "../../services/token.service.js";
import { createRegisteredUser } from "../reward/reward.service.js";
import { consumeRegistrationCode, verifyRegistrationCode } from "../../services/sms-verification.service.js";

export interface RegisterInput {
  phone: string;
  smsCode: string;
  password: string;
  nickname: string;
  inviteCode?: string;
}

/** 创建用户并使用成本因子 12 的 bcrypt 哈希保存密码，永不存储明文密码。 */
export async function register(input: RegisterInput) {
  const verificationId = await verifyRegistrationCode(input.phone, input.smsCode);
  const user = await createRegisteredUser({
    phone: input.phone,
    nickname: input.nickname,
    passwordHash: await bcrypt.hash(input.password, 12),
    inviteCode: input.inviteCode,
  });
  await consumeRegistrationCode(verificationId);
  return buildAuthResult(user);
}

/** 校验账号状态和密码，失败时统一提示，避免暴露手机号是否已经注册。 */
export async function login(phone: string, password: string, request?: Pick<Request, "ip" | "header">, backofficeOnly = false) {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { roles: { select: { role: { select: { code: true } } } } },
  });
  const recentFailures = await prisma.loginLog.count({ where: { account: phone, success: false, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (recentFailures >= 5) throw new AppError(429, 2006, "登录失败次数过多，请 15 分钟后重试");
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    await prisma.loginLog.create({ data: { account: phone, userId: user?.id, success: false, failureCode: "INVALID_CREDENTIALS", ip: request?.ip, userAgent: request?.header("user-agent"), deviceId: request?.header("x-device-id"), appVersion: request?.header("x-app-version") } });
    throw new AppError(401, 2004, "手机号或密码错误");
  }
  if (user.status !== "ACTIVE" || ["FROZEN", "BANNED"].includes(user.riskStatus)) {
    await prisma.loginLog.create({ data: { account: phone, userId: user.id, success: false, failureCode: "ACCOUNT_RESTRICTED", ip: request?.ip, userAgent: request?.header("user-agent"), deviceId: request?.header("x-device-id"), appVersion: request?.header("x-app-version") } });
    throw new AppError(403, 2005, "账号已被禁用");
  }
  // App 仍允许所有用户登录；后台专用入口仅接受管理员或代理账号。
  if (backofficeOnly && user.roles.length === 0) {
    await prisma.loginLog.create({ data: { account: phone, userId: user.id, success: false, failureCode: "BACKOFFICE_FORBIDDEN", ip: request?.ip, userAgent: request?.header("user-agent") } });
    throw new AppError(403, 2008, "该账号不是管理员或代理，无法登录后台");
  }
  const deviceId = request?.header("x-device-id");
  await prisma.loginLog.create({ data: { account: phone, userId: user.id, success: true, ip: request?.ip, userAgent: request?.header("user-agent"), deviceId, appVersion: request?.header("x-app-version") } });
  if (deviceId) await prisma.userDevice.upsert({ where: { userId_deviceId: { userId: user.id, deviceId } }, create: { userId: user.id, deviceId, platform: request?.header("x-platform"), appVersion: request?.header("x-app-version") }, update: { platform: request?.header("x-platform"), appVersion: request?.header("x-app-version"), lastSeenAt: new Date() } });
  return buildAuthResult(user, backofficeOnly ? "admin" : "app");
}

/** 修改密码前验证旧密码，成功后撤销该用户全部刷新令牌。 */
export async function changePassword(userId: bigint, oldPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await bcrypt.compare(oldPassword, user.passwordHash))) throw new AppError(422, 2007, "旧密码不正确");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return null;
}

export function getProfile(userId: bigint) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      nickname: true,
      avatarUrl: true,
      gender: true,
      birthday: true,
      bio: true,
      coinBalance: true,
      frozenCoinBalance: true,
    },
  });
}

/** 更新当前 App 用户资料，只开放不会影响账户安全的字段。 */
export function updateProfile(userId: bigint, input: { nickname: string; gender?: "female" | "male" | "unknown"; birthday?: string; bio?: string }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      nickname: input.nickname,
      gender: input.gender?.toUpperCase() as "FEMALE" | "MALE" | "UNKNOWN" | undefined,
      birthday: input.birthday ? new Date(`${input.birthday}T00:00:00.000Z`) : null,
      bio: input.bio || null,
    },
    select: { id: true, phone: true, nickname: true, avatarUrl: true, gender: true, birthday: true, bio: true },
  });
}

/** 更新头像后返回旧地址，由路由在数据库成功提交后清理旧文件。 */
export async function replaceAvatar(userId: bigint, avatarUrl: string) {
  return prisma.$transaction(async (transaction) => {
    const previous = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    const profile = await transaction.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { avatarUrl: true },
    });
    const remainingReferences = previous.avatarUrl
      ? await transaction.user.count({ where: { avatarUrl: previous.avatarUrl } })
      : 0;
    return {
      previousAvatarUrl: remainingReferences === 0 ? previous.avatarUrl : null,
      profile,
    };
  });
}

async function buildAuthResult(user: { id: bigint; phone: string; nickname: string; avatarUrl: string | null }, session: "admin" | "app" = "app") {
  return {
    ...(await issueTokens(user.id, session)),
    user: { id: user.id, phone: user.phone, nickname: user.nickname, avatarUrl: user.avatarUrl },
  };
}
