import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/http.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type SessionType = "admin" | "app";

const durationSeconds = (value: string) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`Invalid token duration: ${value}`);
  const units = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  return Number(match[1]) * units[match[2] as keyof typeof units];
};

/**
 * 数据库只保存刷新令牌的摘要，泄库后攻击者也不能直接使用存储值。
 * jti 作为单次令牌 ID，便于后续实现令牌轮换、单设备下线和风险封禁。
 */
export const issueTokens = async (userId: bigint, session: SessionType = "app") => {
  const accessExpiresIn = durationSeconds(
    session === "admin" ? env.ADMIN_ACCESS_TOKEN_EXPIRES_IN : env.ACCESS_TOKEN_EXPIRES_IN,
  );
  const refreshExpiresIn = durationSeconds(env.REFRESH_TOKEN_EXPIRES_IN);
  const accessToken = jwt.sign({ type: "access", session }, env.JWT_ACCESS_SECRET, { subject: userId.toString(), expiresIn: accessExpiresIn });
  const tokenId = randomUUID();
  const refreshToken = jwt.sign({ type: "refresh", jti: tokenId, session }, env.JWT_REFRESH_SECRET, { subject: userId.toString(), expiresIn: refreshExpiresIn });
  await prisma.refreshToken.create({ data: { id: tokenId, userId, tokenHash: hash(refreshToken), expiresAt: new Date(Date.now() + refreshExpiresIn * 1000) } });
  return { accessToken, refreshToken, expiresIn: accessExpiresIn };
};

/** 刷新令牌单次使用：原令牌原子撤销后签发新令牌，阻止重放。 */
export async function rotateRefreshToken(token: string) {
  let claims: { sub: string; type: string; jti: string; session?: SessionType };
  try { claims = jwt.verify(token, env.JWT_REFRESH_SECRET) as typeof claims; }
  catch { throw new AppError(401, 2008, "刷新令牌无效或已过期"); }
  if (claims.type !== "refresh" || !claims.jti) throw new AppError(401, 2008, "刷新令牌无效或已过期");
  const revoked = await prisma.refreshToken.updateMany({ where: { id: claims.jti, userId: BigInt(claims.sub), tokenHash: hash(token), revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
  if (revoked.count !== 1) throw new AppError(401, 2008, "刷新令牌无效或已使用");
  return issueTokens(BigInt(claims.sub), claims.session === "admin" ? "admin" : "app");
}

export const revokeRefreshToken = (token: string) => prisma.refreshToken.updateMany({ where: { tokenHash: hash(token), revokedAt: null }, data: { revokedAt: new Date() } });
