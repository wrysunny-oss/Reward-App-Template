import { constants, createHash, privateDecrypt, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { AppError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import type { GoldenWatchProgressInput, InviteRelationsQuery, RewardListQuery, VerifiedAdImpressionInput } from "./reward.schema.js";
import { DAILY_REWARDED_AD_FORMATS, normalizeRewardMilestones, settleAdReward } from "../admin/admin.service.js";
import { createDramaUnlockIntent } from "./ad-reward-intent.js";
import { getAdRuntimeConfig } from "../operation/ad-runtime.service.js";
import { groMoreEcpmToRevenueYuan } from "../webhook/webhook.service.js";
import { assertAllowed } from "../safety/safety.service.js";
import { GOLDEN_WATCH_CONFIG_KEY, GOLDEN_WATCH_RULE_CODE, chinaDate as goldenWatchChinaDate, calculateGoldenWatchDelta, isGoldenWatchActive, parseGoldenWatchConfig } from "./golden-watch.js";
import {saveSdkPlaybackProgress} from "../library/library.service.js";
import { productModules } from "../../generated/product.generated.js";
import { presentInviteMember } from "./invite-relations.js";

type Tx = Prisma.TransactionClient;

/** 生成不易误读的个人邀请码；唯一索引负责处理极低概率的碰撞。 */
function newInviteCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function rssPrivateKeyCandidates(value: string) {
  const key = value.replace(/\\n/g, "\n").trim();
  if (key.includes("BEGIN ")) return [key];
  const body = key.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? key;
  return [
    `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`,
    `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`,
  ];
}

/** 支持官方版本差异中出现过的拼接串、查询串和 JSON 明文格式。 */
export function matchesGroMoreEcpmPlaintext(
  plaintext: string,
  input: Pick<VerifiedAdImpressionInput, "slotId" | "ecpm" | "requestId">,
) {
  const expected = [input.slotId, input.ecpm, input.requestId];
  const delimiters = ["", "+", "_", "|", ",", ":"];
  if (delimiters.some((delimiter) => plaintext === expected.join(delimiter))) return true;

  try {
    const value = JSON.parse(plaintext) as Record<string, unknown>;
    const slotId = value.codeId ?? value.code_id ?? value.slotId ?? value.slot_id;
    const requestId = value.requestId ?? value.request_id;
    return String(slotId) === input.slotId && String(value.ecpm) === input.ecpm && String(requestId) === input.requestId;
  } catch {
    const params = new URLSearchParams(plaintext);
    const slotId = params.get("codeId") ?? params.get("code_id") ?? params.get("slotId") ?? params.get("slot_id");
    const requestId = params.get("requestId") ?? params.get("request_id");
    return slotId === input.slotId && params.get("ecpm") === input.ecpm && requestId === input.requestId;
  }
}

export function verifyGroMoreEncryptedEcpm(input: VerifiedAdImpressionInput, privateKey = env.PANGLE_RSS_PRIVATE_KEY) {
  if (!privateKey) throw new AppError(503, 3412, "未配置穿山甲 PANGLE_RSS_PRIVATE_KEY，非激励广告暂不结算");
  let plaintext: string | undefined;
  const encrypted = Buffer.from(input.rsInfo.replace(/\s+/g, ""), "base64");
  for (const key of rssPrivateKeyCandidates(privateKey)) {
    try {
      plaintext = privateDecrypt(
        { key, padding: constants.RSA_PKCS1_PADDING },
        encrypted,
      ).toString("utf8");
      break;
    } catch {
      // 后台导出的裸密钥可能是 PKCS#8 或 PKCS#1，依次尝试两种 PEM 包装。
    }
  }
  if (!plaintext) {
    throw new AppError(422, 3413, "穿山甲加密 eCPM 凭证解密失败");
  }
  if (!matchesGroMoreEcpmPlaintext(plaintext, input)) {
    throw new AppError(422, 3414, "穿山甲 eCPM、代码位或请求 ID 校验不一致");
  }
}

/** 验真真实曝光后再按全局/用户分成比例结算，摘要键保证同一广告请求全局只发币一次。 */
export async function settleVerifiedAdImpression(userId: bigint, input: VerifiedAdImpressionInput, request: Pick<Request, "method" | "path" | "ip" | "header">) {
  const runtime = await getAdRuntimeConfig();
  const runtimePlacement = input.format === "SPLASH"
    ? runtime.splash
    : input.format === "FEED"
      ? runtime.feed
      : runtime.fullScreen;
  if (!runtime.enabled || !runtimePlacement.enabled || runtimePlacement.placementId !== input.placementId) {
    throw new AppError(409, 3415, "广告位未启用或与后台配置不一致");
  }
  verifyGroMoreEncryptedEcpm(input);
  const idempotencyKey = `gromore-ecpm:${createHash("sha256").update(input.requestId).digest("hex")}`;
  const source = `GROMORE:${input.adnName || "PANGLE"}`.slice(0, 30);
  return settleAdReward(null, {
    requestId: idempotencyKey,
    userId,
    revenueYuan: groMoreEcpmToRevenueYuan(input.ecpm),
    source,
    format: input.format,
  }, request);
}

/** 奖励、余额和流水始终在调用方事务中同时提交。 */
async function award(tx: Tx, userId: bigint, ruleCode: string, type: "INVITE" | "SIGNIN" | "TASK", bizId: string, title: string) {
  const rule = await tx.rewardRule.findUnique({ where: { code: ruleCode } });
  if (!rule?.enabled || rule.amount <= 0n) return null;
  const user = await tx.user.update({ where: { id: userId }, data: { coinBalance: { increment: rule.amount } }, select: { coinBalance: true } });
  return tx.rewardLedger.create({
    data: { userId, type, amount: rule.amount, balanceAfter: user.coinBalance, title, bizId },
  });
}

async function bindInviteInTx(tx: Tx, inviteeId: bigint, inviteCode: string) {
  const existing = await tx.inviteRelation.findUnique({ where: { inviteeId } });
  if (existing) throw new AppError(409, 3101, "该用户已经绑定过邀请关系");
  const inviter = await tx.user.findUnique({ where: { inviteCode }, select: { id: true, invitedBy: { select: { inviterId: true } } } });
  if (!inviter) throw new AppError(404, 3102, "邀请码不存在或已失效");
  if (inviter.id === inviteeId) throw new AppError(409, 3103, "不能绑定自己的邀请码");

  // 沿邀请人的上级链向上检查，禁止 A→B→A 或更深层级的邀请关系闭环。
  let ancestorId: bigint | null = inviter.id;
  const visited = new Set<string>();
  for (let depth = 0; ancestorId && depth < 100; depth += 1) {
    if (ancestorId === inviteeId) throw new AppError(409, 3106, "该邀请码会形成循环邀请关系");
    const key = ancestorId.toString();
    if (visited.has(key)) throw new AppError(409, 3107, "邀请关系数据异常，请联系管理员");
    visited.add(key);
    const parent: { inviterId: bigint } | null = await tx.inviteRelation.findUnique({ where: { inviteeId: ancestorId }, select: { inviterId: true } });
    ancestorId = parent?.inviterId ?? null;
  }
  if (ancestorId) throw new AppError(409, 3108, "邀请层级过深，请联系管理员处理");

  const relation = await tx.inviteRelation.create({ data: { inviterId: inviter.id, inviteeId, inviteCode } });
  await award(tx, inviter.id, "INVITE_DIRECT", "INVITE", `invite-direct:${relation.id}`, "邀请好友奖励");
  const inviteDay = chinaTimestampDayRange();
  const [inviteCountToday, inviteCountLifetime, taskConfig] = await Promise.all([
    tx.inviteRelation.count({ where: { inviterId: inviter.id, createdAt: { gte: inviteDay.start, lt: inviteDay.end } } }),
    tx.inviteRelation.count({ where: { inviterId: inviter.id } }),
    tx.adRewardConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
  ]);
  const inviteDate = inviteDay.start.toISOString().slice(0, 10);
  const milestoneCandidates = normalizeRewardMilestones(taskConfig.inviteMilestones, 1_000_000).filter((item) => item.count <= (item.period === "DAILY" ? inviteCountToday : inviteCountLifetime));
  const milestoneBizId = (item: {count: number; period: "DAILY" | "LIFETIME"}) => `invite-milestone:${inviter.id}:${item.period === "DAILY" ? inviteDate : "lifetime"}:${item.count}`;
  const existingMilestones = milestoneCandidates.length > 0
    ? await tx.rewardLedger.findMany({ where: { type: "TASK", bizId: { in: milestoneCandidates.map(milestoneBizId) } }, select: { bizId: true } })
    : [];
  const existingMilestoneIds = new Set(existingMilestones.map((item) => item.bizId));
  const reachedMilestones = milestoneCandidates.filter((item) => !existingMilestoneIds.has(milestoneBizId(item)));
  for (const milestone of reachedMilestones) {
    const rewardCoins = BigInt(milestone.rewardCoins);
    const updated = await tx.user.update({ where: { id: inviter.id }, data: { coinBalance: { increment: rewardCoins } }, select: { coinBalance: true } });
    await tx.rewardLedger.create({ data: { userId: inviter.id, type: "TASK", amount: rewardCoins, balanceAfter: updated.coinBalance, title: `${milestone.period === "DAILY" ? "今日" : "累计"}邀请 ${milestone.count} 人奖励`, bizId: milestoneBizId(milestone) } });
  }
  if (inviter.invitedBy) {
    await award(tx, inviter.invitedBy.inviterId, "INVITE_INDIRECT", "INVITE", `invite-indirect:${relation.id}`, "间接邀请奖励");
  }
  return relation;
}

export function createRegisteredUser(input: { phone: string; passwordHash: string; nickname: string; inviteCode?: string }) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { phone: input.phone, passwordHash: input.passwordHash, nickname: input.nickname, inviteCode: newInviteCode() } });
    if (productModules.rewards) await award(tx, user.id, "REGISTER", "TASK", `register:${user.id}`, "新用户注册奖励");
    if (productModules.invitations && input.inviteCode) await bindInviteInTx(tx, user.id, input.inviteCode.toUpperCase());
    return tx.user.findUniqueOrThrow({ where: { id: user.id } });
  }, { isolationLevel: "Serializable" });
}

export async function ensureInviteCode(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { inviteCode: true } });
  if (user.inviteCode) return user.inviteCode;
  // 旧用户首次访问时补发邀请码；碰撞时重新尝试。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { inviteCode: newInviteCode() }, select: { inviteCode: true } });
      return updated.inviteCode!;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new AppError(500, 3104, "邀请码生成失败");
}

export async function bindInvite(userId: bigint, inviteCode: string) {
  await assertAllowed(userId, "reward");
  return prisma.$transaction((tx) => bindInviteInTx(tx, userId, inviteCode), { isolationLevel: "Serializable" });
}

/** 只读取当前登录用户的直属上级、直推和间推，不允许指定其他目标用户。 */
export async function getMyInviteRelations(userId: bigint, query: InviteRelationsQuery) {
  const indirectWhere: Prisma.InviteRelationWhereInput = {
    inviter: { invitedBy: { is: { inviterId: userId } } },
  };
  const [parentRelation, directTotal, indirectTotal] = await Promise.all([
    prisma.inviteRelation.findUnique({
      where: { inviteeId: userId },
      select: {
        createdAt: true,
        inviter: { select: { id: true, nickname: true, phone: true } },
      },
    }),
    prisma.inviteRelation.count({ where: { inviterId: userId } }),
    prisma.inviteRelation.count({ where: indirectWhere }),
  ]);

  const offset = (query.page - 1) * query.pageSize;
  const directTake = offset < directTotal ? Math.min(query.pageSize, directTotal - offset) : 0;
  const directSkip = Math.min(offset, directTotal);
  const indirectSkip = Math.max(0, offset - directTotal);
  const indirectTake = query.pageSize - directTake;
  const [directRelations, indirectRelations] = await Promise.all([
    directTake > 0
      ? prisma.inviteRelation.findMany({
          where: { inviterId: userId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: directSkip,
          take: directTake,
          select: {
            createdAt: true,
            invitee: { select: { id: true, nickname: true, phone: true } },
          },
        })
      : Promise.resolve([]),
    indirectTake > 0
      ? prisma.inviteRelation.findMany({
          where: indirectWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: indirectSkip,
          take: indirectTake,
          select: {
            createdAt: true,
            invitee: { select: { id: true, nickname: true, phone: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const total = directTotal + indirectTotal;

  return {
    parent: parentRelation
      ? { ...presentInviteMember(parentRelation.inviter), boundAt: parentRelation.createdAt }
      : null,
    children: {
      list: [
        ...directRelations.map((relation) => ({
          ...presentInviteMember(relation.invitee),
          registeredAt: relation.createdAt,
          level: "DIRECT" as const,
        })),
        ...indirectRelations.map((relation) => ({
          ...presentInviteMember(relation.invitee),
          registeredAt: relation.createdAt,
          level: "INDIRECT" as const,
        })),
      ],
      total,
      directTotal,
      indirectTotal,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page * query.pageSize < total,
    },
  };
}

/** 修改个人邀请码；历史邀请关系仍保留绑定时的邀请码快照。 */
export async function updateInviteCode(userId: bigint, inviteCode: string) {
  const normalizedCode = inviteCode.trim().toUpperCase();
  try {
    return await prisma.user.update({ where: { id: userId }, data: { inviteCode: normalizedCode }, select: { inviteCode: true } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new AppError(409, 3105, "该邀请码已被其他用户使用");
    throw error;
  }
}

/** 将 Asia/Shanghai 的自然日映射为稳定的 UTC 日期值，避免服务器时区变化导致重复签到。 */
function chinaDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(`${parts}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

/** 北京时间当天的真实时间戳范围；区别于签到表使用的“日期占位值”。 */
function chinaTimestampDayRange(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${day}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

async function getGoldenWatchDefinition() {
  const [configRow, rule] = await Promise.all([
    prisma.systemConfig.findUnique({where: {key: GOLDEN_WATCH_CONFIG_KEY}}),
    prisma.rewardRule.findUnique({where: {code: GOLDEN_WATCH_RULE_CODE}}),
  ]);
  const config = parseGoldenWatchConfig(configRow?.value);
  return {config, rule, enabled: config.enabled && Boolean(rule?.enabled) && (rule?.amount ?? 0n) > 0n};
}

function goldenWatchStatus(input: {active: boolean; enabled: boolean; periods: Array<{start: string; end: string}>; requiredSeconds: number; rewardCoins: bigint; watchedSeconds?: number; completedAt?: Date | null}) {
  const watchedSeconds = Math.min(input.requiredSeconds, input.watchedSeconds ?? 0);
  return {
    enabled: input.enabled,
    active: input.enabled && input.active,
    periods: input.periods,
    requiredSeconds: input.requiredSeconds,
    watchedSeconds,
    remainingSeconds: Math.max(0, input.requiredSeconds - watchedSeconds),
    completedToday: Boolean(input.completedAt),
    completedAt: input.completedAt ?? null,
    rewardCoins: input.rewardCoins,
  };
}

export async function getGoldenWatchStatus(userId: bigint, now = new Date()) {
  const {config, rule, enabled} = await getGoldenWatchDefinition();
  const progress = await prisma.goldenWatchProgress.findUnique({where: {userId_date: {userId, date: goldenWatchChinaDate(now)}}});
  return goldenWatchStatus({enabled, active: isGoldenWatchActive(config, now), periods: config.periods, requiredSeconds: config.requiredSeconds, rewardCoins: rule?.amount ?? 0n, watchedSeconds: progress?.watchedSeconds, completedAt: progress?.completedAt});
}

/** 服务端校验时段、真机播放证据和递增心跳，客户端不能指定奖励金额。 */
export async function recordGoldenWatchProgress(userId: bigint, data: GoldenWatchProgressInput, request: Pick<Request, "header">) {
  // 观看历史不受黄金时段和奖励风控开关影响；每次有效播放器心跳都先保存时长。
  await saveSdkPlaybackProgress(userId, data);
  await assertAllowed(userId, "reward");
  const now = new Date();
  const {config, rule, enabled} = await getGoldenWatchDefinition();
  const active = isGoldenWatchActive(config, now);
  const date = goldenWatchChinaDate(now);
  if (!enabled || !active) {
    const progress = await prisma.goldenWatchProgress.findUnique({where: {userId_date: {userId, date}}});
    return {...goldenWatchStatus({enabled, active, periods: config.periods, requiredSeconds: config.requiredSeconds, rewardCoins: rule?.amount ?? 0n, watchedSeconds: progress?.watchedSeconds, completedAt: progress?.completedAt}), awardedCoins: 0n, coinBalance: null};
  }

  const deviceIdentity = request.header("x-device-id")?.trim() || request.header("x-installation-id")?.trim();
  if (!deviceIdentity) throw new AppError(400, 3110, "缺少设备标识，无法累计有效观剧时长");
  const deviceHash = createHash("sha256").update(deviceIdentity).digest("hex");
  const validationWindowMs = Math.max(30 * 60_000, (config.requiredSeconds + 300) * 1_000);
  const playback = await prisma.dramaPlaybackValidation.findFirst({
    where: {userId, deviceHash, playbackStartedAt: {gte: new Date(now.getTime() - validationWindowMs)}, drama: {provider: "PANGLE", externalId: data.externalId, status: "PUBLISHED"}},
    select: {id: true},
  });
  if (!playback) throw new AppError(409, 3111, "尚未验证到当前设备的真实播放，暂不累计时长");

  return prisma.$transaction(async tx => {
    let progress = await tx.goldenWatchProgress.findUnique({where: {userId_date: {userId, date}}});
    if (!progress) progress = await tx.goldenWatchProgress.create({data: {userId, date}});
    if (progress.completedAt) {
      const user = await tx.user.findUniqueOrThrow({where: {id: userId}, select: {coinBalance: true}});
      return {...goldenWatchStatus({enabled, active, periods: config.periods, requiredSeconds: config.requiredSeconds, rewardCoins: rule!.amount, watchedSeconds: progress.watchedSeconds, completedAt: progress.completedAt}), awardedCoins: 0n, coinBalance: user.coinBalance};
    }
    const delta = calculateGoldenWatchDelta({sessionId: data.sessionId, elapsedSeconds: data.elapsedSeconds, previousSessionId: progress.sessionId, previousSessionSeconds: progress.sessionSeconds, previousHeartbeatAt: progress.lastHeartbeatAt, heartbeatSeconds: config.heartbeatSeconds, now});
    const watchedSeconds = Math.min(config.requiredSeconds, progress.watchedSeconds + delta);
    const completedNow = watchedSeconds >= config.requiredSeconds;
    const ledger = completedNow ? await award(tx, userId, GOLDEN_WATCH_RULE_CODE, "TASK", `golden-watch:${userId}:${date.toISOString().slice(0, 10)}`, "黄金时段观剧奖励") : null;
    progress = await tx.goldenWatchProgress.update({
      where: {id: progress.id},
      data: {watchedSeconds, sessionId: data.sessionId, sessionSeconds: Math.max(progress.sessionId === data.sessionId ? progress.sessionSeconds : 0, data.elapsedSeconds), lastHeartbeatAt: now, completedAt: completedNow ? now : null, reward: ledger?.amount ?? 0n},
    });
    const user = await tx.user.findUniqueOrThrow({where: {id: userId}, select: {coinBalance: true}});
    return {...goldenWatchStatus({enabled, active, periods: config.periods, requiredSeconds: config.requiredSeconds, rewardCoins: rule!.amount, watchedSeconds: progress.watchedSeconds, completedAt: progress.completedAt}), awardedCoins: ledger?.amount ?? 0n, coinBalance: user.coinBalance};
  }, {isolationLevel: "Serializable"});
}

async function existingCheckInResult(userId: bigint, date: Date) {
  const [record, user] = await Promise.all([
    prisma.checkIn.findUniqueOrThrow({ where: { userId_date: { userId, date } } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } }),
  ]);
  return { record, awardedCoins: record.reward, coinBalance: user.coinBalance, duplicate: true };
}

export async function checkIn(userId: bigint) {
  await assertAllowed(userId, "reward");
  const today = chinaDate();
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.checkIn.findUnique({ where: { userId_date: { userId, date: today } } });
      if (existing) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
        return { record: existing, awardedCoins: existing.reward, coinBalance: user.coinBalance, duplicate: true };
      }
      const latest = await tx.checkIn.findFirst({ where: { userId }, orderBy: { date: "desc" } });
      const yesterday = chinaDate(-1);
      const streak = latest?.date.getTime() === yesterday.getTime() ? latest.streak + 1 : 1;
      const cycleDay = ((streak - 1) % 7) + 1;
      const rule = await tx.rewardRule.findUnique({ where: { code: `SIGNIN_DAY_${cycleDay}` } });
      const reward = rule?.enabled ? rule.amount : 0n;
      const record = await tx.checkIn.create({ data: { userId, date: today, streak, reward } });
      if (reward > 0n) await award(tx, userId, `SIGNIN_DAY_${cycleDay}`, "SIGNIN", `signin:${userId}:${today.toISOString().slice(0, 10)}`, `连续签到第 ${cycleDay} 天`);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
      return { record, awardedCoins: reward, coinBalance: user.coinBalance, duplicate: false };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    // 两个并发请求都未读到记录时，唯一索引只允许一个提交；另一个按幂等成功返回。
    if ((error as {code?: string}).code === "P2002") return existingCheckInResult(userId, today);
    throw error;
  }
}

/** 查询 SDK 交易号对应的服务端结算，不以客户端“观看完成”作为到账依据。 */
export async function getAdRewardStatus(userId: bigint, transactionId: string) {
  const eventId = `gromore:${transactionId}`;
  const settlement = await prisma.adRewardSettlement.findUnique({
    where: { requestId: eventId },
    select: { id: true, userId: true, awardedCoins: true, milestoneBonusCoins: true, createdAt: true },
  });
  if (settlement?.userId === userId) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
    return {
      status: "SETTLED" as const,
      settlementId: settlement.id,
      awardedCoins: settlement.awardedCoins + settlement.milestoneBonusCoins,
      adAwardedCoins: settlement.awardedCoins,
      milestoneBonusCoins: settlement.milestoneBonusCoins,
      countedForTask: settlement.awardedCoins > 0n,
      coinBalance: user.coinBalance,
      settledAt: settlement.createdAt,
    };
  }

  const callback = await prisma.adCallbackLog.findUnique({
    where: { eventId },
    select: { status: true, reason: true, payload: true, updatedAt: true },
  });
  const payload = callback?.payload as Record<string, unknown> | undefined;
  if (!callback || String(payload?.user_id ?? "") !== userId.toString()) {
    return { status: "PENDING" as const };
  }
  if (callback.status === "FAILED") {
    return { status: "FAILED" as const, message: "奖励暂未到账，广告平台可能继续重试", updatedAt: callback.updatedAt };
  }
  // 短剧解锁发币关闭或风控只会取消金币，不撤销已经通过 SSV 的解锁资格。
  if (callback.status === "SUCCESS" && callback.reason?.startsWith("DRAMA_UNLOCK_")) {
    const user = await prisma.user.findUniqueOrThrow({where: {id: userId}, select: {coinBalance: true}});
    return {
      status: "VERIFIED" as const,
      transactionId,
      coinBalance: user.coinBalance,
      updatedAt: callback.updatedAt,
    };
  }
  return { status: "PENDING" as const, updatedAt: callback.updatedAt };
}

export function issueDramaUnlockAdIntent(userId: bigint, input: {dramaId: string; episodeIndex: number}) {
  const token = createDramaUnlockIntent(userId, input.dramaId, input.episodeIndex);
  return {
    mediaExtra: JSON.stringify({
      source: "drama_unlock",
      dramaId: input.dramaId,
      episodeIndex: input.episodeIndex,
      token,
    }),
  };
}

/**
 * SDK 的 onClose 偶尔先于 onRewardArrived 到达，导致客户端暂时拿不到 trans_id。
 * 此接口只查询当前登录用户、最近 24 小时内且来自 GroMore 的第一笔结算，
 * 用广告开始时间建立安全边界，不接受客户端指定奖励金额。
 */
export async function getLatestAdReward(userId: bigint, after: Date, format: "REWARD" | "DRAMA_UNLOCK" = "REWARD") {
  const earliest = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const effectiveAfter = after < earliest ? earliest : after;
  const settlement = await prisma.adRewardSettlement.findFirst({
    where: {
      userId,
      format,
      source: {startsWith: "GROMORE:"},
      createdAt: {gte: effectiveAfter},
    },
    orderBy: {createdAt: "asc"},
    select: {id: true, requestId: true, awardedCoins: true, milestoneBonusCoins: true, createdAt: true},
  });
  if (!settlement) {
    if (format !== "DRAMA_UNLOCK") return {status: "PENDING" as const};
    // 不发金币的短剧回调没有 settlement，通过 callback 日志仍可证明 SSV 已成功。
    const callbacks = await prisma.adCallbackLog.findMany({
      where: {
        status: "SUCCESS",
        reason: {startsWith: "DRAMA_UNLOCK_"},
        createdAt: {gte: effectiveAfter},
      },
      orderBy: {createdAt: "asc"},
      take: 20,
      select: {eventId: true, payload: true, updatedAt: true},
    });
    const callback = callbacks.find(item => {
      const payload = item.payload as Record<string, unknown> | null;
      return String(payload?.user_id ?? "") === userId.toString();
    });
    if (!callback) return {status: "PENDING" as const};
    const user = await prisma.user.findUniqueOrThrow({where: {id: userId}, select: {coinBalance: true}});
    return {
      status: "VERIFIED" as const,
      transactionId: callback.eventId.replace(/^gromore:/, ""),
      coinBalance: user.coinBalance,
      updatedAt: callback.updatedAt,
    };
  }
  const user = await prisma.user.findUniqueOrThrow({where: {id: userId}, select: {coinBalance: true}});
  return {
    status: "SETTLED" as const,
    settlementId: settlement.id,
    transactionId: settlement.requestId.replace(/^gromore:/, ""),
    awardedCoins: settlement.awardedCoins + settlement.milestoneBonusCoins,
    adAwardedCoins: settlement.awardedCoins,
    milestoneBonusCoins: settlement.milestoneBonusCoins,
    countedForTask: settlement.awardedCoins > 0n,
    coinBalance: user.coinBalance,
    settledAt: settlement.createdAt,
  };
}

export async function getRewardCenter(userId: bigint) {
  const inviteCode = await ensureInviteCode(userId);
  const today = chinaDate();
  const adDay = chinaTimestampDayRange();
  const [relation, invitedCount, invitedCountToday, todayCheckIn, recentCheckIns, rules, inviteRules, adConfig, rewardedAdCountToday, rewardedAdCountLifetime, goldenWatch] = await Promise.all([
    prisma.inviteRelation.findUnique({ where: { inviteeId: userId }, include: { inviter: { select: { nickname: true, phone: true } } } }),
    prisma.inviteRelation.count({ where: { inviterId: userId } }),
    prisma.inviteRelation.count({ where: { inviterId: userId, createdAt: { gte: adDay.start, lt: adDay.end } } }),
    prisma.checkIn.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.checkIn.findMany({ where: { userId, date: { gte: chinaDate(-30) } }, orderBy: { date: "desc" } }),
    prisma.rewardRule.findMany({ where: { code: { startsWith: "SIGNIN_DAY_" } }, orderBy: { code: "asc" } }),
    prisma.rewardRule.findMany({ where: { code: { in: ["INVITE_DIRECT", "INVITE_INDIRECT"] } }, orderBy: { code: "asc" } }),
    prisma.adRewardConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
    prisma.adRewardSettlement.count({ where: { userId, format: {in: [...DAILY_REWARDED_AD_FORMATS]}, source: { startsWith: "GROMORE:" }, awardedCoins: {gt: 0n}, createdAt: { gte: adDay.start, lt: adDay.end } } }),
    prisma.adRewardSettlement.count({ where: { userId, format: {in: [...DAILY_REWARDED_AD_FORMATS]}, source: { startsWith: "GROMORE:" }, awardedCoins: {gt: 0n} } }),
    getGoldenWatchStatus(userId),
  ]);
  const latest = recentCheckIns[0];
  const yesterday = chinaDate(-1);
  const milestoneDate = adDay.start.toISOString().slice(0, 10);
  const milestoneLedgers = await prisma.rewardLedger.findMany({
    where: { userId, type: "TASK", OR: [{ bizId: { startsWith: `ad-milestone:${userId}:` } }, { bizId: { startsWith: `invite-milestone:${userId}:` } }] },
    select: { bizId: true },
  });
  const claimedMilestones = new Set(milestoneLedgers.map((item) => item.bizId));
  const milestoneClaimed = (task: "ad" | "invite", item: {count: number; period: "DAILY" | "LIFETIME"}) => claimedMilestones.has(`${task}-milestone:${userId}:${item.period === "DAILY" ? milestoneDate : "lifetime"}:${item.count}`);
  // 只有最后一次签到发生在今天或昨天，历史 streak 才仍代表“连续签到”。
  const streak = latest && [today.getTime(), yesterday.getTime()].includes(latest.date.getTime()) ? latest.streak : 0;
  return {
    inviteCode,
    relation,
    invitedCount,
    invitedCountToday,
    checkedInToday: Boolean(todayCheckIn),
    streak,
    recentCheckIns,
    signInRules: rules,
    inviteRewards: Object.fromEntries(inviteRules.map(rule => [rule.code, { amount: rule.amount, enabled: rule.enabled }])),
    rewardedAdCountToday,
    rewardedAdDailyLimit: adConfig.dailyRewardedAdLimit,
    rewardedVideoRewardEnabled: adConfig.rewardedVideoRewardEnabled,
    dramaUnlockRewardEnabled: adConfig.dramaUnlockRewardEnabled,
    rewardedAdMilestones: normalizeRewardMilestones(adConfig.rewardedAdMilestones).map((item) => ({ ...item, progress: item.period === "DAILY" ? rewardedAdCountToday : rewardedAdCountLifetime, completed: milestoneClaimed("ad", item) })),
    inviteMilestones: normalizeRewardMilestones(adConfig.inviteMilestones, 1_000_000).map((item) => ({ ...item, progress: item.period === "DAILY" ? invitedCountToday : invitedCount, completed: milestoneClaimed("invite", item) })),
    goldenWatch,
  };
}

/** App 金币明细只返回当前用户的数据，按创建时间倒序分页。 */
export async function listMyLedgers(userId: bigint, query: RewardListQuery) {
  const [list, total] = await prisma.$transaction([
    prisma.rewardLedger.findMany({ where: { userId }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { createdAt: "desc" } }),
    prisma.rewardLedger.count({ where: { userId } }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

export const listRewardRules = () => prisma.rewardRule.findMany({ orderBy: { code: "asc" } });
export function updateRewardRule(operatorId: bigint, code: string, data: { amount: bigint; enabled: boolean }, request: Pick<Request, "method" | "path" | "ip" | "header">) {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.rewardRule.update({ where: { code }, data });
    await tx.auditLog.create({ data: {
      operatorId, action: "reward.rule.update", method: request.method, path: request.path,
      targetType: "reward_rule", targetId: code, ip: request.ip, userAgent: request.header("user-agent"),
      detail: { amount: data.amount.toString(), enabled: data.enabled },
    } });
    return rule;
  });
}

export async function listInvites(query: RewardListQuery, allowedUserIds?: bigint[]) {
  const where = allowedUserIds ? { inviteeId: { in: allowedUserIds } } : {};
  const [list, total] = await prisma.$transaction([
    prisma.inviteRelation.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { inviter: { select: { phone: true, nickname: true } }, invitee: { select: { phone: true, nickname: true } } }, orderBy: { id: "desc" } }),
    prisma.inviteRelation.count({ where }),
  ]);
  return { list, total, ...query };
}

export async function listCheckIns(query: RewardListQuery, allowedUserIds?: bigint[]) {
  const where = allowedUserIds ? { userId: { in: allowedUserIds } } : {};
  const [list, total] = await prisma.$transaction([
    prisma.checkIn.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { phone: true, nickname: true } } }, orderBy: { id: "desc" } }),
    prisma.checkIn.count({ where }),
  ]);
  return { list, total, ...query };
}
