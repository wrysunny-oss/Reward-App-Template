import type { Request } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { env } from "../../config.js";
import { AppError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import type { RewardMilestoneDefinition as RewardMilestone, UpdateAdRewardConfig } from "../../contracts/reward.generated.js";
import type { LedgerListQuery, UserListQuery } from "./admin.schema.js";
import { assertFreshRiskAssessment } from "../safety/safety.service.js";
import { createUserNotification } from "../notification/notification.service.js";
import { assertAgentCanViewUser, getAgentDescendantIds, getAgentDescendants } from "./agent-scope.js";

export async function getDashboard(agentId?: bigint) {
  const descendantIds = agentId ? await getAgentDescendantIds(agentId) : undefined;
  if (agentId) {
    const [users, coins] = await prisma.$transaction([
      prisma.user.count({ where: { id: { in: descendantIds! } } }),
      prisma.rewardLedger.aggregate({ _sum: { amount: true }, where: { userId: { in: descendantIds! }, amount: { gt: 0 } } }),
    ]);
    // 代理看板不返回全平台内容、工单及资金对账信息。
    return { users, coinsIssued: coins._sum.amount ?? 0n, publishedDramas: 0, feedbackPending: 0, reconciliationPending: 0, latestReconciliation: null };
  }
  // 独立统计放入批量事务，只占用一次数据库往返。
  const [users, publishedDramas, feedbackPending, coins, reconciliationPending, latestReconciliation] = await prisma.$transaction([
    prisma.user.count({ where: descendantIds ? { id: { in: descendantIds } } : undefined }),
    prisma.drama.count({ where: { status: "PUBLISHED" } }),
    prisma.feedback.count({ where: { status: "PENDING" } }),
    prisma.rewardLedger.aggregate({ _sum: { amount: true }, where: { amount: { gt: 0 }, ...(descendantIds ? { userId: { in: descendantIds } } : {}) } }),
    prisma.riskEvent.count({ where: { status: "PENDING", ruleCode: { startsWith: "RECONCILIATION_" } } }),
    prisma.reconciliationRun.findFirst({ orderBy: { startedAt: "desc" }, select: { status: true, issueCount: true, startedAt: true } }),
  ]);

  const { end: todayEnd } = chinaTimestampDayRange();
  const dayRanges = Array.from({ length: 7 }, (_, index) => {
    const daysAgo = 6 - index;
    const start = new Date(todayEnd.getTime() - (daysAgo + 1) * 86_400_000);
    return {
      date: new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Asia/Shanghai",
      }).format(start),
      end: new Date(start.getTime() + 86_400_000),
      start,
    };
  });

  const [trend, userStatusGroups, dramaStatusGroups] = await Promise.all([
    Promise.all(dayRanges.map(async ({ date, end, start }) => {
      const [newUsers, ads] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
        prisma.adRewardSettlement.aggregate({
          _count: { _all: true },
          _sum: { awardedCoins: true, revenueMicros: true },
          where: { createdAt: { gte: start, lt: end } },
        }),
      ]);
      return {
        adRevenueMicros: ads._sum.revenueMicros ?? 0n,
        adSettlements: ads._count._all,
        awardedCoins: ads._sum.awardedCoins ?? 0n,
        date,
        newUsers,
      };
    })),
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.drama.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const today = trend.at(-1)!;
  return {
    users,
    publishedDramas,
    feedbackPending,
    coinsIssued: coins._sum.amount ?? 0,
    reconciliationPending,
    latestReconciliation,
    trend,
    today: {
      adRevenueMicros: today.adRevenueMicros,
      adSettlements: today.adSettlements,
      awardedCoins: today.awardedCoins,
      newUsers: today.newUsers,
    },
    userStatusDistribution: userStatusGroups.map((item) => ({ count: item._count._all, status: item.status })),
    dramaStatusDistribution: dramaStatusGroups.map((item) => ({ count: item._count._all, status: item.status })),
  };
}

/**
 * 后台直接创建代理，不建立上级邀请关系。
 * 用户、代理角色关系和审计日志在同一事务提交，避免产生半成品账号。
 */
export async function createLevelOneAgent(
  operatorId: bigint,
  input: { agentShareRateBps: number; nickname: string; password: string; phone: string },
  request: Pick<Request, "method" | "path" | "ip" | "header">,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { code: "level_one_agent" },
        create: { code: "level_one_agent", name: "代理", description: "由管理员创建、可登录只读后台的代理用户", isSystem: true },
        update: { name: "代理", description: "由管理员创建、可登录只读后台的代理用户" },
      });
      const user = await tx.user.create({
        data: {
          phone: input.phone,
          nickname: input.nickname,
          passwordHash: await bcrypt.hash(input.password, 12),
          inviteCode: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
          agentShareRateBps: input.agentShareRateBps,
          roles: { create: { roleId: role.id } },
        },
        select: { id: true, phone: true, nickname: true, inviteCode: true, agentShareRateBps: true, status: true, createdAt: true, roles: { select: { role: { select: { code: true, name: true } } } } },
      });
      await tx.auditLog.create({ data: {
        operatorId, action: "agent.level_one.create", method: request.method, path: request.path,
        targetType: "user", targetId: user.id.toString(), ip: request.ip,
        userAgent: request.header("user-agent"), detail: { phone: input.phone, role: "level_one_agent", agentShareRateBps: input.agentShareRateBps },
      } });
      return user;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new AppError(409, 3010, "手机号已存在，请更换后重试");
    throw error;
  }
}

export const getAdRewardConfig = async () => {
  const config = await prisma.adRewardConfig.upsert({
    where: { id: 1 }, create: { id: 1 }, update: {},
  });
  return { ...config, rewardedAdMilestones: normalizeRewardMilestones(config.rewardedAdMilestones), inviteMilestones: normalizeRewardMilestones(config.inviteMilestones, 1_000_000), secureEcpmReady: Boolean(env.PANGLE_RSS_PRIVATE_KEY) };
};

/** 数据库 JSON 进入结算前统一清洗，旧数据或人工误改不会导致错误发币。 */
export function normalizeRewardMilestones(value: Prisma.JsonValue | null | undefined, maxCount = 1_000): RewardMilestone[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, RewardMilestone>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const count = Number((item as Record<string, unknown>).count);
    const rewardCoins = Number((item as Record<string, unknown>).rewardCoins);
    const period = (item as Record<string, unknown>).period === "LIFETIME" ? "LIFETIME" : "DAILY";
    if (!Number.isInteger(count) || count < 1 || count > maxCount || !Number.isInteger(rewardCoins) || rewardCoins < 1 || rewardCoins > 1_000_000_000) continue;
    unique.set(`${period}:${count}`, { count, rewardCoins, period });
  }
  return [...unique.values()].sort((left, right) => left.period.localeCompare(right.period) || left.count - right.count);
}

/** 更新全局广告分成比例并记录审计；比例以万分比保存。 */
export async function updateAdRewardConfig(operatorId: bigint, rates: UpdateAdRewardConfig, request: Pick<Request, "method" | "path" | "ip" | "header">) {
  const normalizedRates = {
    ...rates,
    rewardedAdMilestones: normalizeRewardMilestones(rates.rewardedAdMilestones as unknown as Prisma.JsonValue) as unknown as Prisma.InputJsonValue,
    inviteMilestones: normalizeRewardMilestones(rates.inviteMilestones as unknown as Prisma.JsonValue, 1_000_000) as unknown as Prisma.InputJsonValue,
  };
  const config = await prisma.$transaction(async (tx) => {
    const config = await tx.adRewardConfig.upsert({ where: { id: 1 }, create: { id: 1, ...normalizedRates }, update: normalizedRates });
    await tx.auditLog.create({ data: { operatorId, action: "ad.reward.config.update", method: request.method, path: request.path, targetType: "ad_reward_config", targetId: "1", ip: request.ip, userAgent: request.header("user-agent"), detail: normalizedRates as unknown as Prisma.InputJsonValue } });
    return config;
  });
  return { ...config, rewardedAdMilestones: normalizeRewardMilestones(config.rewardedAdMilestones), inviteMilestones: normalizeRewardMilestones(config.inviteMilestones, 1_000_000), secureEcpmReady: Boolean(env.PANGLE_RSS_PRIVATE_KEY) };
}

/** 设置用户独立广告分成；null 恢复继承全局比例。 */
export function updateUserAdShare(operatorId: bigint, userId: bigint, shareRateBps: null | number, request: Pick<Request, "method" | "path" | "ip" | "header">) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: { adShareRateBps: shareRateBps }, select: { id: true, adShareRateBps: true } });
    await tx.auditLog.create({ data: { operatorId, action: "user.ad_share.update", method: request.method, path: request.path, targetType: "user", targetId: userId.toString(), ip: request.ip, userAgent: request.header("user-agent"), detail: { shareRateBps } } });
    return user;
  });
}

/** 仅允许调整管理员创建的代理；普通用户即使直接调用接口也不能获得代理能力。 */
export function updateAgentShareRate(operatorId: bigint, userId: bigint, agentShareRateBps: number, request: Pick<Request, "method" | "path" | "ip" | "header">) {
  return prisma.$transaction(async (tx) => {
    const agent = await tx.user.findFirst({ where: { id: userId, roles: { some: { role: { code: "level_one_agent" } } } }, select: { id: true } });
    if (!agent) throw new AppError(422, 3011, "该用户不是管理员创建的代理");
    const user = await tx.user.update({ where: { id: userId }, data: { agentShareRateBps }, select: { id: true, agentShareRateBps: true } });
    await tx.auditLog.create({ data: { operatorId, action: "agent.share_rate.update", method: request.method, path: request.path, targetType: "user", targetId: userId.toString(), ip: request.ip, userAgent: request.header("user-agent"), detail: { agentShareRateBps } } });
    return user;
  });
}

/** 将最多 6 位小数的人民币元字符串转换为百万分之一元，整个过程不使用浮点数。 */
function yuanToMicros(value: string) {
  const [yuan, fraction = ""] = value.split(".");
  return BigInt(yuan!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

/** 获取北京时间当天对应的 UTC 时间范围，用于带时间戳记录的自然日统计。 */
function chinaTimestampDayRange(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${day}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** 纯函数：观看者取得完整基础收益，两级返佣是平台在此基础上额外支付的成本。 */
export function calculateAdDistribution(input: { revenueMicros: bigint; coinsPerCent: number; userRateBps: number; directRateBps: number; indirectRateBps: number; hasDirect: boolean; hasIndirect: boolean }) {
  const baseUserCoins = input.revenueMicros * BigInt(input.coinsPerCent) * BigInt(input.userRateBps) / 100_000_000n;
  const directAwardedCoins = input.hasDirect ? baseUserCoins * BigInt(input.directRateBps) / 10_000n : 0n;
  const indirectAwardedCoins = input.hasIndirect ? baseUserCoins * BigInt(input.indirectRateBps) / 10_000n : 0n;
  return { baseUserCoins, awardedCoins: baseUserCoins, directAwardedCoins, indirectAwardedCoins };
}

/** 代理佣金以观看用户的基础广告收益为基数，由平台额外支付并向下取整。 */
export function calculateAgentCommission(baseUserCoins: bigint, agentShareRateBps: number) {
  return baseUserCoins * BigInt(agentShareRateBps) / 10_000n;
}

/**
 * 按“人民币收入 × 每元金币 × 有效分成比例”结算单次广告收益。
 * requestId 幂等；用户独立比例优先，否则使用全局比例。
 */
export type AdRewardFormat = "SPLASH" | "FEED" | "FULL_SCREEN" | "REWARD" | "DRAMA_UNLOCK";

/** 福利中心任务激励和短剧解锁激励共用同一个每日收益次数额度。 */
export const DAILY_REWARDED_AD_FORMATS = ["REWARD", "DRAMA_UNLOCK"] as const;

export function usesDailyRewardedAdLimit(format: AdRewardFormat) {
  return DAILY_REWARDED_AD_FORMATS.some((item) => item === format);
}

const rewardSwitchByFormat = {
  SPLASH: "splashRewardEnabled",
  FEED: "feedRewardEnabled",
  FULL_SCREEN: "fullScreenRewardEnabled",
  REWARD: "rewardedVideoRewardEnabled",
  DRAMA_UNLOCK: "dramaUnlockRewardEnabled",
} as const;

export function settleAdReward(operatorId: bigint | null, input: { requestId: string; revenueYuan: string; source: string; userId: bigint; format?: AdRewardFormat; enforceDailyLimit?: boolean }, request: Pick<Request, "method" | "path" | "ip" | "header">) {
  return assertFreshRiskAssessment(input.userId, "reward").then(() => prisma.$transaction(async (tx) => {
    const existing = await tx.adRewardSettlement.findUnique({ where: { requestId: input.requestId } });
    if (existing) return existing;
    const [user, globalConfig, withdrawalConfig, invitation] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { adShareRateBps: true, status: true, riskStatus: true } }),
      tx.adRewardConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
      tx.withdrawalConfig.upsert({
        where: { id: 1 },
        create: {id: 1, tiers: ['10000', '50000', '100000', '500000', '1000000']},
        update: {},
      }),
      tx.inviteRelation.findUnique({ where: { inviteeId: input.userId }, include: { inviter: { select: { invitedBy: { select: { inviterId: true } } } } } }),
    ]);
    const format = input.format ?? "REWARD";
    if (!globalConfig[rewardSwitchByFormat[format]]) {
      throw new AppError(409, 3411, `${format} 广告收益分成已关闭`);
    }
    if (user.status !== "ACTIVE" || ["BANNED", "FROZEN", "REWARD_RESTRICTED"].includes(user.riskStatus)) {
      throw new AppError(403, 3401, "当前账号风险状态不允许结算广告奖励");
    }
    const rewardedDay = chinaTimestampDayRange();
    let completedRewardedAds = 0;
    let lifetimeRewardedAds = 0;
    if (input.enforceDailyLimit && usesDailyRewardedAdLimit(format)) {
      const rewardedWhere: Prisma.AdRewardSettlementWhereInput = {
          userId: input.userId,
          format: { in: [...DAILY_REWARDED_AD_FORMATS] },
          source: { startsWith: "GROMORE:" },
          awardedCoins: { gt: 0n },
      };
      const [settledToday, settledLifetime] = await Promise.all([
        tx.adRewardSettlement.count({ where: { ...rewardedWhere, createdAt: { gte: rewardedDay.start, lt: rewardedDay.end } } }),
        tx.adRewardSettlement.count({ where: rewardedWhere }),
      ]);
      if (settledToday >= globalConfig.dailyRewardedAdLimit) {
        throw new AppError(429, 3410, `今日激励广告次数已达上限（${globalConfig.dailyRewardedAdLimit} 次）`);
      }
      completedRewardedAds = settledToday + 1;
      lifetimeRewardedAds = settledLifetime + 1;
    }
    const revenueMicros = yuanToMicros(input.revenueYuan);
    const shareRateBps = user.adShareRateBps ?? globalConfig.defaultShareRateBps;
    const indirectInviterId = invitation?.inviter.invitedBy?.inviterId;
    const { baseUserCoins, awardedCoins, directAwardedCoins, indirectAwardedCoins } = calculateAdDistribution({ revenueMicros, coinsPerCent: withdrawalConfig.coinsPerCent, userRateBps: shareRateBps, directRateBps: globalConfig.directShareRateBps, indirectRateBps: globalConfig.indirectShareRateBps, hasDirect: Boolean(invitation), hasIndirect: Boolean(indirectInviterId) });
    if (awardedCoins <= 0n) {
      completedRewardedAds = 0;
      lifetimeRewardedAds = 0;
    }
    // 沿唯一邀请父链一直向上查找。Set 防御脏数据环路；正常邀请关系没有固定层级上限。
    const ancestorAgents: Array<{ agentId: bigint; awardedCoins: bigint; depth: number; shareRateBps: number }> = [];
    const visited = new Set<string>([input.userId.toString()]);
    let currentUserId = input.userId;
    let depth = 0;
    while (true) {
      const parent = await tx.inviteRelation.findUnique({
        where: { inviteeId: currentUserId },
        select: { inviter: { select: { id: true, status: true, riskStatus: true, agentShareRateBps: true, roles: { where: { role: { code: "level_one_agent" } }, select: { roleId: true } } } } },
      });
      if (!parent) break;
      depth += 1;
      const ancestor = parent.inviter;
      const key = ancestor.id.toString();
      if (visited.has(key)) throw new AppError(409, 3012, "邀请关系存在循环，无法完成代理结算");
      visited.add(key);
      if (ancestor.roles.length > 0 && ancestor.agentShareRateBps !== null && ancestor.status === "ACTIVE" && !["BANNED", "FROZEN", "REWARD_RESTRICTED"].includes(ancestor.riskStatus)) {
        ancestorAgents.push({ agentId: ancestor.id, depth, shareRateBps: ancestor.agentShareRateBps, awardedCoins: calculateAgentCommission(baseUserCoins, ancestor.agentShareRateBps) });
      }
      currentUserId = ancestor.id;
    }
    const milestoneCandidates = completedRewardedAds > 0
      ? normalizeRewardMilestones(globalConfig.rewardedAdMilestones).filter((item) => item.count <= (item.period === "DAILY" ? completedRewardedAds : lifetimeRewardedAds))
      : [];
    const rewardDate = rewardedDay.start.toISOString().slice(0, 10);
    const milestoneBizId = (item: RewardMilestone) => `ad-milestone:${input.userId}:${item.period === "DAILY" ? rewardDate : "lifetime"}:${item.count}`;
    const existingMilestoneLedgers = milestoneCandidates.length > 0
      ? await tx.rewardLedger.findMany({ where: { type: "TASK", bizId: { in: milestoneCandidates.map(milestoneBizId) } }, select: { bizId: true } })
      : [];
    const existingMilestoneIds = new Set(existingMilestoneLedgers.map((item) => item.bizId));
    const reachedMilestones = milestoneCandidates.filter((item) => !existingMilestoneIds.has(milestoneBizId(item)));
    const milestoneBonusCoins = reachedMilestones.reduce((sum, item) => sum + BigInt(item.rewardCoins), 0n);
    const settlement = await tx.adRewardSettlement.create({ data: {
      requestId: input.requestId, userId: input.userId, revenueMicros, shareRateBps,
      directInviterId: invitation?.inviterId, indirectInviterId,
      directShareRateBps: globalConfig.directShareRateBps, indirectShareRateBps: globalConfig.indirectShareRateBps,
      coinsPerCent: withdrawalConfig.coinsPerCent, baseUserCoins, awardedCoins, milestoneBonusCoins, directAwardedCoins, indirectAwardedCoins, commissionFunding: "PLATFORM_FUNDED", format, source: input.source,
    } });
    const credit = async (userId: bigint, coins: bigint, title: string, suffix: string) => {
      if (coins <= 0n) return;
      const updated = await tx.user.update({ where: { id: userId }, data: { coinBalance: { increment: coins } }, select: { coinBalance: true } });
      await tx.rewardLedger.create({ data: { userId, type: "AD", amount: coins, balanceAfter: updated.coinBalance, title, bizId: `ad:${settlement.id}:${suffix}` } });
    };
    await credit(input.userId, awardedCoins, "观看广告收益", "viewer");
    if (awardedCoins > 0n) {
      await createUserNotification(tx, input.userId, { type: "REWARD", title: "广告奖励已到账", content: `本次观看奖励 ${awardedCoins.toString()} 金币已计入余额。` });
    }
    for (const milestone of reachedMilestones) {
      const coins = BigInt(milestone.rewardCoins);
      const updated = await tx.user.update({ where: { id: input.userId }, data: { coinBalance: { increment: coins } }, select: { coinBalance: true } });
      await tx.rewardLedger.create({ data: { userId: input.userId, type: "TASK", amount: coins, balanceAfter: updated.coinBalance, title: `${milestone.period === "DAILY" ? "今日" : "累计"}激励广告 ${milestone.count} 次奖励`, bizId: milestoneBizId(milestone) } });
      await createUserNotification(tx, input.userId, { type: "REWARD", title: "阶梯任务奖励已到账", content: `${milestone.period === "DAILY" ? "今日" : "累计"}获得 ${milestone.count} 次广告收益，额外奖励 ${coins.toString()} 金币。` });
    }
    if (invitation) await credit(invitation.inviterId, directAwardedCoins, "直推用户广告分成", "direct");
    if (indirectInviterId) await credit(indirectInviterId, indirectAwardedCoins, "间推用户广告分成", "indirect");
    for (const agent of ancestorAgents) {
      if (agent.awardedCoins <= 0n) continue;
      await tx.agentAdCommission.create({ data: { settlementId: settlement.id, agentId: agent.agentId, sourceUserId: input.userId, depth: agent.depth, shareRateBps: agent.shareRateBps, awardedCoins: agent.awardedCoins } });
      await credit(agent.agentId, agent.awardedCoins, `代理下级广告分成（第 ${agent.depth} 层）`, `agent:${agent.agentId}`);
    }
    const agentAwardedCoins = ancestorAgents.reduce((sum, item) => sum + item.awardedCoins, 0n);
    await tx.auditLog.create({ data: { operatorId, action: "ad.reward.settle", method: request.method, path: request.path, targetType: "ad_reward_settlement", targetId: settlement.id, ip: request.ip, userAgent: request.header("user-agent"), detail: { requestId: input.requestId, format, revenueYuan: input.revenueYuan, shareRateBps, directShareRateBps: globalConfig.directShareRateBps, indirectShareRateBps: globalConfig.indirectShareRateBps, baseUserCoins: baseUserCoins.toString(), awardedCoins: awardedCoins.toString(), milestoneBonusCoins: milestoneBonusCoins.toString(), completedRewardedAds, lifetimeRewardedAds, directAwardedCoins: directAwardedCoins.toString(), indirectAwardedCoins: indirectAwardedCoins.toString(), agentAwardedCoins: agentAwardedCoins.toString(), agentCount: ancestorAgents.length, source: input.source } } });
    return settlement;
  }, { isolationLevel: "Serializable" }));
}

export async function listAdRewardSettlements(query: { page: number; pageSize: number; userId?: bigint }, agentId?: bigint) {
  const descendantIds = agentId ? await getAgentDescendantIds(agentId) : undefined;
  if (agentId && query.userId && !descendantIds!.some((id) => id === query.userId)) {
    throw new AppError(403, 2012, "只能查看自己下级成员的广告收益");
  }
  const where = query.userId ? { userId: query.userId } : descendantIds ? { userId: { in: descendantIds } } : {};
  const [list, total] = await prisma.$transaction([
    prisma.adRewardSettlement.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { phone: true, nickname: true } }, agentCommissions: { where: agentId ? { agentId } : undefined, include: { agent: { select: { id: true, phone: true, nickname: true } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.adRewardSettlement.count({ where }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

/** 广告收益看板使用结算快照聚合，避免受后续比例变更影响。 */
export async function getAdRewardDashboard(agentId?: bigint) {
  const descendantIds = agentId ? await getAgentDescendantIds(agentId) : undefined;
  const [rows, agentSummary] = await prisma.$transaction([
    prisma.adRewardSettlement.findMany({ where: descendantIds ? { userId: { in: descendantIds } } : undefined, select: { revenueMicros: true, coinsPerCent: true, baseUserCoins: true, awardedCoins: true, milestoneBonusCoins: true, directAwardedCoins: true, indirectAwardedCoins: true } }),
    prisma.agentAdCommission.aggregate({ where: agentId ? { agentId } : undefined, _sum: { awardedCoins: true } }),
  ]);
  const summary = rows.reduce((result, row) => {
    result.revenueMicros += row.revenueMicros;
    result.grossEquivalentCoins += row.revenueMicros * BigInt(row.coinsPerCent) / 10_000n;
    result.baseUserCoins += row.baseUserCoins;
    result.awardedCoins += row.awardedCoins;
    result.milestoneBonusCoins += row.milestoneBonusCoins;
    result.directAwardedCoins += row.directAwardedCoins;
    result.indirectAwardedCoins += row.indirectAwardedCoins;
    return result;
  }, { revenueMicros: 0n, grossEquivalentCoins: 0n, baseUserCoins: 0n, awardedCoins: 0n, milestoneBonusCoins: 0n, directAwardedCoins: 0n, indirectAwardedCoins: 0n });
  // 平台留存必须扣除所有实际发放；平台额外返佣可能令该值为负，代表活动补贴成本。
  const agentAwardedCoins = agentSummary._sum.awardedCoins ?? 0n;
  return { count: rows.length, ...summary, agentAwardedCoins, platformRetainedCoins: summary.grossEquivalentCoins - summary.awardedCoins - summary.milestoneBonusCoins - summary.directAwardedCoins - summary.indirectAwardedCoins - agentAwardedCoins };
}

/** 返回指定用户向下两级团队及各成员贡献，层级相对于当前查看用户。 */
export async function getUserTeam(userId: bigint, agentId?: bigint) {
  if (agentId) await assertAgentCanViewUser(agentId, userId);
  const [direct, indirect, directContribution, indirectContribution, agentContribution] = await Promise.all([
    prisma.inviteRelation.findMany({ where: { inviterId: userId }, include: { invitee: { select: { id: true, phone: true, nickname: true, status: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.inviteRelation.findMany({ where: { inviter: { invitedBy: { inviterId: userId } } }, include: { inviter: { select: { id: true, nickname: true } }, invitee: { select: { id: true, phone: true, nickname: true, status: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.adRewardSettlement.aggregate({ where: { directInviterId: userId }, _sum: { directAwardedCoins: true } }),
    prisma.adRewardSettlement.aggregate({ where: { indirectInviterId: userId }, _sum: { indirectAwardedCoins: true } }),
    prisma.agentAdCommission.aggregate({ where: { agentId: userId }, _sum: { awardedCoins: true }, _count: true }),
  ]);
  return { direct, indirect, summary: { directCount: direct.length, indirectCount: indirect.length, directCommissionCoins: directContribution._sum.directAwardedCoins ?? 0n, indirectCommissionCoins: indirectContribution._sum.indirectAwardedCoins ?? 0n, agentCommissionCoins: agentContribution._sum.awardedCoins ?? 0n, agentCommissionCount: agentContribution._count } };
}

export async function listUsers(query: UserListQuery, agentId?: bigint) {
  const { page, pageSize, keyword } = query;
  const descendants = agentId ? await getAgentDescendants(agentId) : undefined;
  const descendantIds = descendants?.map((item) => item.id);
  const where = {
    ...(descendantIds ? { id: { in: descendantIds } } : {}),
    ...(keyword ? { OR: [{ phone: { contains: keyword } }, { nickname: { contains: keyword } }] } : {}),
  };
  const [list, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, phone: true, nickname: true, status: true, coinBalance: true, frozenCoinBalance: true, adShareRateBps: true, createdAt: true, roles: { select: { role: { select: { code: true, name: true } } } } },
      orderBy: { id: "desc" },
    }),
    prisma.user.count({ where }),
  ]);
  const hierarchy = new Map(descendants?.map((item) => [item.id.toString(), item]) ?? []);
  return {
    list: list.map((user) => {
      const node = hierarchy.get(user.id.toString());
      return { ...user, agentDepth: node?.depth, agentParentId: node?.parentId };
    }),
    page, pageSize, total,
  };
}

/**
 * 代理专属看板：所有统计严格限定为当前代理邀请树。
 * 金额使用结算快照和佣金流水，比例修改后不会改写历史统计。
 */
export async function getAgentOverview(agentId: bigint) {
  const descendantIds = await getAgentDescendantIds(agentId);
  const now = new Date();
  const timezoneOffset = 8 * 60 * 60 * 1000;
  const chinaNow = new Date(now.getTime() + timezoneOffset);
  const todayStart = new Date(Date.UTC(chinaNow.getUTCFullYear(), chinaNow.getUTCMonth(), chinaNow.getUTCDate()) - timezoneOffset);
  const monthStart = new Date(Date.UTC(chinaNow.getUTCFullYear(), chinaNow.getUTCMonth(), 1) - timezoneOffset);
  const activeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const trendStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  const settlementWhere = { userId: { in: descendantIds } };
  const [todayMembers, activeGroups, allAds, todayAds, monthAds, allCommission, todayCommission, monthCommission, trendRows, rankingGroups] = await prisma.$transaction([
    prisma.user.count({ where: { id: { in: descendantIds }, createdAt: { gte: todayStart } } }),
    prisma.adRewardSettlement.groupBy({ by: ["userId"], where: { ...settlementWhere, createdAt: { gte: activeStart } }, orderBy: { userId: "asc" } }),
    prisma.adRewardSettlement.aggregate({ where: settlementWhere, _count: true, _sum: { revenueMicros: true, awardedCoins: true } }),
    prisma.adRewardSettlement.aggregate({ where: { ...settlementWhere, createdAt: { gte: todayStart } }, _count: true, _sum: { revenueMicros: true, awardedCoins: true } }),
    prisma.adRewardSettlement.aggregate({ where: { ...settlementWhere, createdAt: { gte: monthStart } }, _count: true, _sum: { revenueMicros: true, awardedCoins: true } }),
    prisma.agentAdCommission.aggregate({ where: { agentId }, _count: true, _sum: { awardedCoins: true } }),
    prisma.agentAdCommission.aggregate({ where: { agentId, createdAt: { gte: todayStart } }, _sum: { awardedCoins: true } }),
    prisma.agentAdCommission.aggregate({ where: { agentId, createdAt: { gte: monthStart } }, _sum: { awardedCoins: true } }),
    prisma.adRewardSettlement.findMany({ where: { ...settlementWhere, createdAt: { gte: trendStart } }, select: { createdAt: true, revenueMicros: true, awardedCoins: true } }),
    prisma.adRewardSettlement.groupBy({ by: ["userId"], where: settlementWhere, _sum: { revenueMicros: true, awardedCoins: true }, _count: true, orderBy: { _sum: { awardedCoins: "desc" } }, take: 10 }),
  ]);
  const rankingUsers = await prisma.user.findMany({ where: { id: { in: rankingGroups.map((item) => item.userId) } }, select: { id: true, nickname: true, phone: true } });
  const userMap = new Map(rankingUsers.map((user) => [user.id.toString(), user]));
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(trendStart.getTime() + index * 24 * 60 * 60 * 1000);
    const key = new Date(date.getTime() + timezoneOffset).toISOString().slice(0, 10);
    const rows = trendRows.filter((row) => new Date(row.createdAt.getTime() + timezoneOffset).toISOString().slice(0, 10) === key);
    return { date: key, count: rows.length, revenueMicros: rows.reduce((sum, row) => sum + row.revenueMicros, 0n), awardedCoins: rows.reduce((sum, row) => sum + row.awardedCoins, 0n) };
  });
  return {
    members: { total: descendantIds.length, today: todayMembers, active30Days: activeGroups.length },
    ads: {
      total: { count: allAds._count, revenueMicros: allAds._sum.revenueMicros ?? 0n, awardedCoins: allAds._sum.awardedCoins ?? 0n },
      today: { count: todayAds._count, revenueMicros: todayAds._sum.revenueMicros ?? 0n, awardedCoins: todayAds._sum.awardedCoins ?? 0n },
      month: { count: monthAds._count, revenueMicros: monthAds._sum.revenueMicros ?? 0n, awardedCoins: monthAds._sum.awardedCoins ?? 0n },
    },
    commission: { total: allCommission._sum.awardedCoins ?? 0n, today: todayCommission._sum.awardedCoins ?? 0n, month: monthCommission._sum.awardedCoins ?? 0n, count: allCommission._count },
    trend,
    ranking: rankingGroups.map((row) => ({ user: userMap.get(row.userId.toString()), count: row._count, revenueMicros: row._sum?.revenueMicros ?? 0n, awardedCoins: row._sum?.awardedCoins ?? 0n })),
  };
}

/** 用户详情使用字段白名单，不返回密码摘要、刷新令牌等安全字段。 */
export async function getUserDetail(userId: bigint, agentId?: bigint) {
  if (agentId) await assertAgentCanViewUser(agentId, userId);
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, phone: true, nickname: true, avatarUrl: true, gender: true,
      birthday: true, bio: true, status: true, coinBalance: true, frozenCoinBalance: true, adShareRateBps: true, agentShareRateBps: true,
      createdAt: true, updatedAt: true,
      roles: { select: { role: { select: { id: true, code: true, name: true } } } },
      _count: { select: { favorites: true, histories: true, ledgers: true } },
    },
  });
}

export async function listCoinLedgers(query: LedgerListQuery) {
  const { page, pageSize, userId } = query;
  const where = userId ? { userId } : {};
  const [list, total] = await prisma.$transaction([
    prisma.rewardLedger.findMany({
      where, skip: (page - 1) * pageSize, take: pageSize,
      include: { user: { select: { phone: true, nickname: true } } },
      orderBy: { id: "desc" },
    }),
    prisma.rewardLedger.count({ where }),
  ]);
  return { list, page, pageSize, total };
}

/**
 * 人工调账使用串行化事务，并先做原子条件更新。
 * 余额、不可变流水和审计记录要么全部成功，要么全部回滚。
 */
export function adjustUserCoins(
  operatorId: bigint,
  userId: bigint,
  amount: bigint,
  reason: string,
  request: Pick<Request, "method" | "path" | "ip" | "header">,
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, ...(amount < 0n ? { coinBalance: { gte: -amount } } : {}) },
      data: { coinBalance: { increment: amount } },
    });
    if (updated.count !== 1) throw new AppError(409, 3001, "用户不存在或金币余额不足");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
    const ledger = await tx.rewardLedger.create({
      data: { userId, type: "ADJUSTMENT", amount, balanceAfter: user.coinBalance, title: reason, bizId: randomUUID() },
    });
    await tx.auditLog.create({ data: {
      operatorId, action: "coin.adjust", method: request.method, path: request.path,
      targetType: "user", targetId: userId.toString(), ip: request.ip,
      userAgent: request.header("user-agent"), detail: { amount: amount.toString(), reason, ledgerId: ledger.id.toString() },
    } });
    return { balance: user.coinBalance, ledger };
  }, { isolationLevel: "Serializable" });
}

/**
 * 用户状态与审计日志必须在同一事务提交，避免出现“账号已封禁但没有操作记录”。
 * request 只用于提取审计上下文，不应把完整请求体写入日志以免泄露敏感信息。
 */
export function updateUserStatus(
  operatorId: bigint,
  userId: bigint,
  status: "ACTIVE" | "DISABLED",
  request: Pick<Request, "method" | "path" | "ip" | "header">,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: { status } });
    await tx.auditLog.create({
      data: {
        operatorId,
        action: "user.status.update",
        method: request.method,
        path: request.path,
        targetType: "user",
        targetId: user.id.toString(),
        ip: request.ip,
        userAgent: request.header("user-agent"),
        detail: { status },
      },
    });
    return user;
  });
}

export const listPermissions = () => prisma.permission.findMany({ orderBy: [{ module: "asc" }, { id: "asc" }] });
export const listRoles = () => prisma.role.findMany({
  include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } },
  orderBy: { id: "asc" },
});

export async function updateRolePermissions(roleId: number, permissionIds: number[]) {
  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
  if (role.isSystem) throw new AppError(409, 3002, "系统内置角色不允许修改");
  return prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId, permissionId })), skipDuplicates: true });
    return tx.role.findUniqueOrThrow({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  });
}

export const listAdmins = () => prisma.user.findMany({
  // 管理员列表排除代理角色，避免把只读代理误标为管理员用户。
  where: { roles: { some: { role: { code: { not: "level_one_agent" } } } } },
  select: { id: true, phone: true, nickname: true, status: true, createdAt: true, roles: { select: { role: true } } },
  orderBy: { id: "asc" },
});
export const listAuditLogs = () => prisma.auditLog.findMany({ take: 100, orderBy: { id: "desc" } });
