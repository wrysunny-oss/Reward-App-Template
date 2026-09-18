import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { env } from "../../config.js";
import { AppError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { settleAdReward } from "../admin/admin.service.js";
import type { GroMoreRewardQuery } from "./webhook.schema.js";
import { verifyDramaUnlockIntent } from "../reward/ad-reward-intent.js";
import { getAdRuntimeConfig } from "../operation/ad-runtime.service.js";

const MAX_CLOCK_SKEW_SECONDS = 300;

/** 校验时间戳、来源 IP 和 HMAC，避免伪造请求及五分钟以外的重放请求。 */
export function verifyPangleSignature(request: Request) {
  const timestamp = request.header("x-pangle-timestamp") ?? "";
  const nonce = request.header("x-pangle-nonce") ?? "";
  const signature = request.header("x-pangle-signature") ?? "";
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) {
    throw new AppError(401, 3601, "回调时间戳无效或已过期");
  }
  const allowedIps = env.PANGLE_CALLBACK_IPS.split(",").map((item) => item.trim()).filter(Boolean);
  if (allowedIps.length && !allowedIps.includes(request.ip ?? "")) throw new AppError(403, 3602, "回调来源 IP 不在白名单中");
  const expected = createHmac("sha256", env.PANGLE_CALLBACK_SECRET).update(`${timestamp}.${nonce}.${JSON.stringify(request.body)}`).digest("hex");
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (!nonce || actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new AppError(401, 3603, "回调签名验证失败");
  }
}

/** 先落接收日志，再使用 eventId 作为结算 requestId，重复回调只返回首次处理结果。 */
export async function receivePangleAdRevenue(input: { eventId: string; userId: bigint; revenueYuan: string; source: string }, request: Request) {
  const existing = await prisma.adCallbackLog.findUnique({ where: { eventId: input.eventId } });
  if (existing?.status === "SUCCESS") return { eventId: input.eventId, status: "SUCCESS", duplicate: true };
  if (existing?.status === "PROCESSING") throw new AppError(409, 3604, "该回调正在处理中");
  await prisma.adCallbackLog.upsert({
    where: { eventId: input.eventId },
    create: { eventId: input.eventId, status: "PROCESSING", payload: { ...input, userId: input.userId.toString() }, ip: request.ip },
    update: { status: "PROCESSING", reason: null, payload: { ...input, userId: input.userId.toString() }, ip: request.ip },
  });
  try {
    const settlement = await settleAdReward(null, { ...input, requestId: input.eventId }, request);
    await prisma.adCallbackLog.update({ where: { eventId: input.eventId }, data: { status: "SUCCESS" } });
    return { eventId: input.eventId, settlementId: settlement.id, status: "SUCCESS", duplicate: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : "未知错误";
    await prisma.adCallbackLog.update({ where: { eventId: input.eventId }, data: { status: "FAILED", reason } });
    throw error;
  }
}

/** 后台分页查看成功、失败和处理中回调，便于运营排查平台对接问题。 */
export async function listCallbackLogs(query: { page: number; pageSize: number }) {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const [list, total, success, failed, processing, staleProcessing] = await prisma.$transaction([
    prisma.adCallbackLog.findMany({ skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { createdAt: "desc" } }),
    prisma.adCallbackLog.count(),
    prisma.adCallbackLog.count({ where: { status: "SUCCESS" } }),
    prisma.adCallbackLog.count({ where: { status: "FAILED" } }),
    prisma.adCallbackLog.count({ where: { status: "PROCESSING" } }),
    prisma.adCallbackLog.count({ where: { status: "PROCESSING", updatedAt: { lt: staleBefore } } }),
  ]);
  return { list, total, summary: { success, failed, processing, staleProcessing }, ...query };
}

/** GroMore 签名只覆盖交易号，规则为 sha256(m-key:trans_id)。 */
export function verifyGroMoreSign(transId: string, signature: string, securityKey = env.PANGLE_REWARD_SECURITY_KEY) {
  if (!securityKey) return false;
  const expected = createHash("sha256").update(`${securityKey}:${transId}`).digest("hex");
  const actualBuffer = Buffer.from(signature.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * GroMore eCPM 单位为“分/千次展示”。换算单次展示人民币收入：
 * ecpm(分) / 100(元) / 1000(次)，最终向下截断到项目支持的百万分之一元。
 */
export function groMoreEcpmToRevenueYuan(ecpmFen: string) {
  const [integer, fraction = ""] = ecpmFen.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const fenScaled = BigInt(integer!) * scale + BigInt(fraction || "0");
  const revenueMicros = fenScaled * 10n / scale;
  return `${revenueMicros / 1_000_000n}.${(revenueMicros % 1_000_000n).toString().padStart(6, "0")}`;
}

function groMoreRewardContext(extra: string | undefined, userId: bigint) {
  if (!extra) return { format: "REWARD" as const };
  try {
    const value = JSON.parse(extra) as Record<string, unknown>;
    if (value.source !== "drama_unlock") return { format: "REWARD" as const };
    const intent = verifyDramaUnlockIntent(String(value.token ?? ""), userId);
    if (!intent || intent.dramaId !== String(value.dramaId ?? "") || intent.episodeIndex !== Number(value.episodeIndex ?? 0)) {
      return { format: "INVALID_DRAMA_UNLOCK" as const };
    }
    return { format: "DRAMA_UNLOCK" as const, dramaId: intent.dramaId, episodeIndex: intent.episodeIndex };
  } catch {
    return { format: "REWARD" as const };
  }
}

async function recordRejectedGroMoreReward(input: GroMoreRewardQuery, request: Request, reason: string) {
  const payload = {...input, user_id: input.user_id.toString(), sign: '[REDACTED]'};
  try {
    await prisma.adCallbackLog.create({
      data: {
        eventId: `gromore:${input.trans_id}`,
        status: 'FAILED',
        reason,
        payload,
        ip: request.ip,
      },
    });
  } catch (error) {
    // 已存在的成功、处理中或失败记录都不能被无效重试覆盖。
    if ((error as {code?: string}).code !== 'P2002') throw error;
  }
}

/**
 * 处理 GroMore 官方激励回调。无论验证成功与否都返回平台约定结构；
 * trans_id 复用为结算 requestId，确保平台重试不会重复发放金币。
 */
export async function receiveGroMoreReward(input: GroMoreRewardQuery, request: Request) {
  if (!verifyGroMoreSign(input.trans_id, input.sign)) {
    await recordRejectedGroMoreReward(input, request, 'GroMore 回调签名校验失败');
    return { is_verify: false, reason: 40001 };
  }
  // prime_rit 是 GroMore 聚合广告位；mediation_rit 是本次命中的 ADN 代码位。
  // 后台配置的是聚合广告位，因此必须校验 prime_rit，不能拿代码位比较。
  const runtimeConfig = await getAdRuntimeConfig();
  if (input.prime_rit !== runtimeConfig.reward.placementId) {
    await recordRejectedGroMoreReward(input, request, `GroMore 聚合广告位不匹配：${input.prime_rit}`);
    return { is_verify: false, reason: 40002 };
  }
  if (!input.ecpm || Number(input.ecpm) <= 0) {
    await recordRejectedGroMoreReward(input, request, 'GroMore 回调缺少有效 eCPM');
    return { is_verify: false, reason: 40001 };
  }

  const eventId = `gromore:${input.trans_id}`;
  const payload = { ...input, user_id: input.user_id.toString(), sign: "[REDACTED]" };
  // 先通过 eventId 唯一索引抢占处理权，禁止两个并发回调同时进入金币结算。
  try {
    await prisma.adCallbackLog.create({ data: { eventId, status: "PROCESSING", payload, ip: request.ip } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await prisma.adCallbackLog.findUniqueOrThrow({ where: { eventId } });
    if (existing.status === "SUCCESS") return { is_verify: true, reason: 20000 };
    if (existing.status === "PROCESSING") return { is_verify: false, reason: 50001 };
    // 失败记录允许平台重试，但 updateMany 条件更新确保仍只有一个请求取得重试权。
    const claimed = await prisma.adCallbackLog.updateMany({
      where: { eventId, status: "FAILED" },
      data: { status: "PROCESSING", reason: null, payload, ip: request.ip },
    });
    if (claimed.count !== 1) return { is_verify: false, reason: 50001 };
  }
  try {
    const source = `GROMORE:${input.adn_name || "UNKNOWN"}`.slice(0, 30);
    const context = groMoreRewardContext(input.extra, input.user_id);
    if (context.format === "INVALID_DRAMA_UNLOCK") {
      throw new Error("短剧解锁广告意图签名无效或已过期");
    }
    if (context.format === "DRAMA_UNLOCK") {
      const config = await prisma.adRewardConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      // 关闭“短剧解锁发币”只影响平台金币分成，不能让已经完整观看广告的用户解锁失败。
      if (!config.dramaUnlockRewardEnabled) {
        await prisma.adCallbackLog.update({ where: { eventId }, data: { status: "SUCCESS", reason: "DRAMA_UNLOCK_REWARD_DISABLED" } });
        return { is_verify: true, reason: 20000 };
      }
    }
    try {
      await settleAdReward(null, { requestId: eventId, userId: input.user_id, revenueYuan: groMoreEcpmToRevenueYuan(input.ecpm), source, format: context.format, enforceDailyLimit: true }, request);
    } catch (error) {
      // 风控或运营策略只限制金币，不撤销用户已经通过完整观看取得的剧集解锁资格。
      if (context.format === "DRAMA_UNLOCK" && error instanceof AppError && [3401, 3402, 3410, 3411].includes(error.code)) {
        await prisma.adCallbackLog.update({ where: { eventId }, data: { status: "SUCCESS", reason: `DRAMA_UNLOCK_NO_COIN:${error.code}` } });
        return { is_verify: true, reason: 20000 };
      }
      throw error;
    }
    await prisma.adCallbackLog.update({ where: { eventId }, data: { status: "SUCCESS" } });
    return { is_verify: true, reason: 20000 };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : "未知错误";
    await prisma.adCallbackLog.update({ where: { eventId }, data: { status: "FAILED", reason } });
    return { is_verify: false, reason: 50002 };
  }
}
