import { AppError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import type { Request } from "express";
import type { ReconciliationSchedule } from "./reconciliation.schema.js";

export interface ReconciliationRunOptions {
  /** 定时任务使用稳定键防止多个服务实例在同一天重复执行。 */
  scheduleKey?: string;
  source?: "MANUAL" | "SCHEDULED";
}

export async function runReconciliation(options: ReconciliationRunOptions = {}) {
  const active = await prisma.reconciliationRun.count({ where: { status: "RUNNING", startedAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
  if (active) throw new AppError(409, 3501, "已有对账任务正在执行");
  const run = await prisma.reconciliationRun.create({
    data: {
      scheduleKey: options.scheduleKey,
      source: options.source ?? "MANUAL",
    },
  });
  try {
    const [users, ledgerGroups, frozenGroups, adSettlements, agentCommissions, adLedgers] = await Promise.all([
      prisma.user.findMany({ select: { id: true, coinBalance: true, frozenCoinBalance: true } }),
      prisma.rewardLedger.groupBy({ by: ["userId"], _sum: { amount: true } }),
      prisma.withdrawal.groupBy({ by: ["userId"], where: { status: { in: ["PENDING", "PAYING"] } }, _sum: { coins: true } }),
      prisma.adRewardSettlement.findMany({ select: { id: true, userId: true, directInviterId: true, indirectInviterId: true, baseUserCoins: true, awardedCoins: true, directAwardedCoins: true, indirectAwardedCoins: true, commissionFunding: true } }),
      prisma.agentAdCommission.findMany({ select: { settlementId: true, agentId: true, awardedCoins: true } }),
      prisma.rewardLedger.findMany({ where: { type: "AD", bizId: { startsWith: "ad:" } }, select: { userId: true, amount: true, bizId: true } }),
    ]);
    const ledgerMap = new Map(ledgerGroups.map((item) => [item.userId.toString(), item._sum.amount ?? 0n]));
    const frozenMap = new Map(frozenGroups.map((item) => [item.userId.toString(), item._sum.coins ?? 0n]));
    const issues: Array<{ runId: string; userId: bigint; type: string; actualAmount: bigint; expectedAmount: bigint; difference: bigint }> = [];
    for (const user of users) {
      const expectedAvailable = ledgerMap.get(user.id.toString()) ?? 0n;
      const expectedFrozen = frozenMap.get(user.id.toString()) ?? 0n;
      if (user.coinBalance !== expectedAvailable) issues.push({ runId: run.id, userId: user.id, type: "AVAILABLE_COIN", actualAmount: user.coinBalance, expectedAmount: expectedAvailable, difference: user.coinBalance - expectedAvailable });
      if (user.frozenCoinBalance !== expectedFrozen) issues.push({ runId: run.id, userId: user.id, type: "FROZEN_COIN", actualAmount: user.frozenCoinBalance, expectedAmount: expectedFrozen, difference: user.frozenCoinBalance - expectedFrozen });
    }
    // 历史记录按用户收益内拆分核对；新记录必须保证观看者完整取得基础收益，返佣由平台额外承担。
    const adLedgerMap = new Map(adLedgers.map((item) => [item.bizId ?? "", item]));
    for (const settlement of adSettlements) {
      const actualViewerCoins = settlement.commissionFunding === "PLATFORM_FUNDED"
        ? settlement.awardedCoins
        : settlement.awardedCoins + settlement.directAwardedCoins + settlement.indirectAwardedCoins;
      if (actualViewerCoins !== settlement.baseUserCoins) issues.push({ runId: run.id, userId: settlement.userId, type: "AD_DISTRIBUTION", actualAmount: actualViewerCoins, expectedAmount: settlement.baseUserCoins, difference: actualViewerCoins - settlement.baseUserCoins });
      const payouts = [
        { suffix: "viewer", userId: settlement.userId, amount: settlement.awardedCoins },
        { suffix: "direct", userId: settlement.directInviterId, amount: settlement.directAwardedCoins },
        { suffix: "indirect", userId: settlement.indirectInviterId, amount: settlement.indirectAwardedCoins },
      ];
      for (const payout of payouts) {
        if (!payout.userId || payout.amount <= 0n) continue;
        const ledger = adLedgerMap.get(`ad:${settlement.id}:${payout.suffix}`);
        const actual = ledger?.userId === payout.userId ? ledger.amount : 0n;
        if (actual !== payout.amount) issues.push({ runId: run.id, userId: payout.userId, type: "AD_LEDGER", actualAmount: actual, expectedAmount: payout.amount, difference: actual - payout.amount });
      }
    }
    // 每一笔平台代理佣金也必须对应唯一的代理金币流水。
    for (const commission of agentCommissions) {
      const ledger = adLedgerMap.get(`ad:${commission.settlementId}:agent:${commission.agentId}`);
      const actual = ledger?.userId === commission.agentId ? ledger.amount : 0n;
      if (actual !== commission.awardedCoins) issues.push({ runId: run.id, userId: commission.agentId, type: "AGENT_AD_LEDGER", actualAmount: actual, expectedAmount: commission.awardedCoins, difference: actual - commission.awardedCoins });
    }
    await prisma.$transaction(async (tx) => {
      if (issues.length) await tx.reconciliationIssue.createMany({ data: issues });
      for (const issue of issues) {
        const ruleCode = `RECONCILIATION_${issue.type}`;
        const exists = await tx.riskEvent.findFirst({ where: { userId: issue.userId, ruleCode, status: "PENDING" } });
        if (!exists) await tx.riskEvent.create({ data: { userId: issue.userId, ruleCode, level: "HIGH", title: "资金对账发现余额差异", detail: { actual: issue.actualAmount.toString(), expected: issue.expectedAmount.toString(), difference: issue.difference.toString(), runId: run.id } } });
      }
      await tx.reconciliationRun.update({ where: { id: run.id }, data: { status: issues.length ? "FAILED" : "PASSED", checkedUsers: users.length, issueCount: issues.length, completedAt: new Date() } });
    });
    return prisma.reconciliationRun.findUniqueOrThrow({ where: { id: run.id }, include: { issues: true } });
  } catch (error) {
    await prisma.reconciliationRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "未知错误" } });
    throw error;
  }
}

export const listRuns = () => prisma.reconciliationRun.findMany({ take: 50, include: { issues: true }, orderBy: { startedAt: "desc" } });

const DEFAULT_SCHEDULE: ReconciliationSchedule = { enabled: true, hour: 3, minute: 0, timezone: "Asia/Shanghai" };

/** 获取经过默认值补全的自动对账配置。 */
export async function getSchedule(): Promise<ReconciliationSchedule> {
  const row = await prisma.systemConfig.findUnique({ where: { key: "finance.reconciliation_schedule" } });
  if (!row || typeof row.value !== "object" || Array.isArray(row.value)) return DEFAULT_SCHEDULE;
  return { ...DEFAULT_SCHEDULE, ...(row.value as Partial<ReconciliationSchedule>) };
}

/** 更新自动对账配置，并将操作人和变更内容写入不可变审计日志。 */
export function updateSchedule(
  operatorId: bigint,
  data: ReconciliationSchedule,
  request: Pick<Request, "method" | "path" | "ip" | "header">,
) {
  return prisma.$transaction(async (tx) => {
    const config = await tx.systemConfig.upsert({
      where: { key: "finance.reconciliation_schedule" },
      create: { key: "finance.reconciliation_schedule", value: data, description: "资金自动对账时间；修改后无需重启服务" },
      update: { value: data },
    });
    await tx.auditLog.create({ data: {
      operatorId, action: "reconciliation.schedule.update", method: request.method,
      path: request.path, targetType: "system_config", targetId: config.key,
      ip: request.ip, userAgent: request.header("user-agent"), detail: data,
    } });
    return config.value;
  });
}
