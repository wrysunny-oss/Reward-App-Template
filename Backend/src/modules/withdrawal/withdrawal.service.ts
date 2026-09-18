import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma, WithdrawalStatus } from "@prisma/client";
import type { Request } from "express";
import { env } from "../../config.js";
import { AppError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import type { WithdrawalListQuery } from "./withdrawal.schema.js";
import { assertAllowed, assertFreshRiskAssessment } from "../safety/safety.service.js";
import { createUserNotification } from "../notification/notification.service.js";
import {
  classifyAlipayStatus,
  getAlipayPayoutReadiness,
  queryAlipayTransfer,
  transferToAlipay,
  type AlipayPayoutResult,
} from "./alipay-payout.service.js";

type Tx = Prisma.TransactionClient;
type AuditRequest = Pick<Request, "method" | "path" | "ip" | "header">;
const cipherKey = createHash("sha256").update(env.WITHDRAW_DATA_SECRET).digest();

/** AES-256-GCM 同时提供保密性和完整性；数据库只保存密文与脱敏展示值。 */
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(value: string) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new AppError(500, 3209, "收款信息密文损坏");
  const decipher = createDecipheriv("aes-256-gcm", cipherKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function maskAccount(value: string) {
  if (value.length <= 7) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function chinaDayRange() {
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = new Date(`${text}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function auditData(operatorId: bigint, action: string, withdrawalId: string, request: AuditRequest, detail: Prisma.InputJsonValue) {
  return { operatorId, action, method: request.method, path: request.path, targetType: "withdrawal", targetId: withdrawalId, ip: request.ip, userAgent: request.header("user-agent"), detail };
}

export const getConfig = () => prisma.withdrawalConfig.findUniqueOrThrow({ where: { id: 1 } });

/** 只向 App 返回脱敏账号，不提供密文或可逆的完整收款信息。 */
export async function getPayoutAccount(userId: bigint) {
  const account = await prisma.payoutAccount.findUnique({ where: { userId }, select: { channel: true, accountMasked: true, createdAt: true, updatedAt: true } });
  return account ? { bound: true, ...account } : { bound: false };
}

/** 绑定与换绑都覆盖同一条账户记录，历史提现单仍保留申请时的账户快照。 */
export async function bindPayoutAccount(userId: bigint, input: { channel: "ALIPAY" | "WECHAT" | "BANK"; account: string; realName: string }) {
  const encrypted = { channel: input.channel, accountCipher: encrypt(input.account), accountMasked: maskAccount(input.account), realNameCipher: encrypt(input.realName) };
  const account = await prisma.payoutAccount.upsert({ where: { userId }, create: { userId, ...encrypted }, update: encrypted, select: { channel: true, accountMasked: true, createdAt: true, updatedAt: true } });
  return { bound: true, ...account };
}

/** 申请时原子扣减可用金币并增加冻结金币；requestId 保证客户端重试不会重复扣款。 */
export async function createWithdrawal(userId: bigint, input: { requestId: string; coins: bigint }) {
  const existingResult = async () => {
    const existing = await prisma.withdrawal.findUnique({ where: { requestId: input.requestId } });
    if (!existing) return null;
    if (existing.userId !== userId) throw new AppError(409, 3201, "请求编号已被占用");
    if (existing.coins !== input.coins) throw new AppError(409, 3213, "同一请求编号不能修改提现金额");
    return { ...existing, duplicate: true };
  };
  const existing = await existingResult();
  if (existing) return existing;
  await assertAllowed(userId, "withdrawal");
  await assertFreshRiskAssessment(userId, "withdrawal");

  try {
    return await prisma.$transaction(async (tx) => {
      const config = await tx.withdrawalConfig.findUniqueOrThrow({ where: { id: 1 } });
      const payoutAccount = await tx.payoutAccount.findUnique({ where: { userId } });
      if (!payoutAccount) throw new AppError(422, 3212, "请先在设置中绑定收款账户");
      if (!config.enabled) throw new AppError(409, 3202, "提现功能暂未开放");
      const tiers = Array.isArray(config.tiers) ? config.tiers.map(String) : [];
      if (!tiers.includes(input.coins.toString())) throw new AppError(422, 3203, "请选择后台配置的提现档位");
      const { start, end } = chinaDayRange();
      const daily = await tx.withdrawal.aggregate({
        where: { userId, createdAt: { gte: start, lt: end }, status: { in: ["PENDING", "PAYING", "COMPLETED"] } },
        _count: true, _sum: { coins: true },
      });
      if (daily._count >= config.dailyCountLimit || (daily._sum.coins ?? 0n) + input.coins > config.dailyCoinLimit) throw new AppError(429, 3205, "已超过今日提现限额");
      const amountCents = Number(input.coins / BigInt(config.coinsPerCent));
      const feeCents = Math.floor(amountCents * config.feeRateBps / 10_000);
      if (amountCents - feeCents <= 0) throw new AppError(422, 3206, "扣除手续费后到账金额必须大于 0");
      const updated = await tx.user.updateMany({ where: { id: userId, coinBalance: { gte: input.coins } }, data: { coinBalance: { decrement: input.coins }, frozenCoinBalance: { increment: input.coins } } });
      if (updated.count !== 1) throw new AppError(409, 3207, "可用金币余额不足");
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
      const withdrawal = await tx.withdrawal.create({ data: {
        requestId: input.requestId, userId, coins: input.coins, amountCents, feeCents, actualCents: amountCents - feeCents,
        channel: payoutAccount.channel, accountCipher: payoutAccount.accountCipher, accountMasked: payoutAccount.accountMasked, realNameCipher: payoutAccount.realNameCipher,
      } });
      await tx.rewardLedger.create({ data: { userId, type: "WITHDRAW", amount: -input.coins, balanceAfter: user.coinBalance, title: "提现冻结", bizId: `withdraw-freeze:${withdrawal.id}` } });
      return { ...withdrawal, duplicate: false };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    // 两个相同请求同时首次到达时，唯一索引只允许一笔订单成功并冻结余额。
    if ((error as { code?: string }).code === "P2002") {
      const raced = await existingResult();
      if (raced) return raced;
    }
    throw error;
  }
}

export async function listMine(userId: bigint, query: WithdrawalListQuery) {
  const where = { userId, ...(query.status ? { status: query.status } : {}) };
  const [list, total] = await prisma.$transaction([
    prisma.withdrawal.findMany({ where, select: { id: true, requestId: true, coins: true, amountCents: true, feeCents: true, actualCents: true, channel: true, accountMasked: true, status: true, reviewRemark: true, paymentReference: true, createdAt: true, updatedAt: true }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { createdAt: "desc" } }),
    prisma.withdrawal.count({ where }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

export async function listAdmin(query: WithdrawalListQuery) {
  const where: Prisma.WithdrawalWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.keyword ? { user: { OR: [{ phone: { contains: query.keyword } }, { nickname: { contains: query.keyword } }] } } : {}) };
  const [list, total] = await prisma.$transaction([
    prisma.withdrawal.findMany({ where, select: { id: true, requestId: true, userId: true, coins: true, amountCents: true, feeCents: true, actualCents: true, channel: true, accountMasked: true, status: true, reviewRemark: true, paymentReference: true, reviewedBy: true, reviewedAt: true, completedAt: true, createdAt: true, user: { select: { phone: true, nickname: true, coinBalance: true, frozenCoinBalance: true } } }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { createdAt: "desc" } }),
    prisma.withdrawal.count({ where }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

/** 查看完整收款信息属于敏感操作，因此每次读取都会产生审计日志。 */
export function getAdminDetail(operatorId: bigint, id: string, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.withdrawal.findUniqueOrThrow({ where: { id }, include: { user: { select: { phone: true, nickname: true } } } });
    await tx.auditLog.create({ data: auditData(operatorId, "withdrawal.sensitive.read", id, request, { status: item.status }) });
    const { accountCipher, realNameCipher, ...safe } = item;
    return { ...safe, account: decrypt(accountCipher), realName: decrypt(realNameCipher) };
  });
}

async function refund(tx: Tx, item: { id: string; userId: bigint; coins: bigint }) {
  const updated = await tx.user.updateMany({ where: { id: item.userId, frozenCoinBalance: { gte: item.coins } }, data: { coinBalance: { increment: item.coins }, frozenCoinBalance: { decrement: item.coins } } });
  if (updated.count !== 1) throw new AppError(409, 3208, "冻结金币余额异常");
  const user = await tx.user.findUniqueOrThrow({ where: { id: item.userId }, select: { coinBalance: true } });
  await tx.rewardLedger.create({ data: { userId: item.userId, type: "WITHDRAW", amount: item.coins, balanceAfter: user.coinBalance, title: "提现退回", bizId: `withdraw-refund:${item.id}` } });
}

/** 审核仅允许 PENDING -> PAYING/REJECTED；拒绝时自动退回冻结金币。 */
export function review(operatorId: bigint, id: string, approved: boolean, remark: string, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
    const status: WithdrawalStatus = approved ? "PAYING" : "REJECTED";
    const changed = await tx.withdrawal.updateMany({ where: { id, status: "PENDING" }, data: { status, reviewRemark: remark, reviewedBy: operatorId, reviewedAt: new Date(), ...(!approved ? { completedAt: new Date() } : {}) } });
    if (changed.count !== 1) throw new AppError(409, 3210, "该订单当前状态不可审核");
    if (!approved) await refund(tx, item);
    await createUserNotification(tx, item.userId, approved ? {
      type: "WITHDRAWAL", title: "提现审核已通过", content: `您的提现申请已通过审核，预计到账 ¥${(item.actualCents / 100).toFixed(2)}，请留意收款账户。`,
    } : {
      type: "WITHDRAWAL", title: "提现申请未通过", content: `您的提现申请未通过审核，${item.coins.toString()} 金币已退回可用余额。原因：${remark}`,
    });
    await tx.auditLog.create({ data: auditData(operatorId, approved ? "withdrawal.approve" : "withdrawal.reject", id, request, { remark }) });
    return tx.withdrawal.findUniqueOrThrow({ where: { id } });
  }, { isolationLevel: "Serializable" });
}

/** 打款确认仅允许 PAYING -> COMPLETED/FAILED；失败时自动退回冻结金币。 */
export function complete(operatorId: bigint, id: string, success: boolean, remark: string, paymentReference: string | undefined, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
    const changed = await tx.withdrawal.updateMany({ where: { id, status: "PAYING" }, data: { status: success ? "COMPLETED" : "FAILED", reviewRemark: remark, paymentReference, completedAt: new Date() } });
    if (changed.count !== 1) throw new AppError(409, 3211, "该订单当前状态不可确认打款");
    if (success) {
      const updated = await tx.user.updateMany({ where: { id: item.userId, frozenCoinBalance: { gte: item.coins } }, data: { frozenCoinBalance: { decrement: item.coins } } });
      if (updated.count !== 1) throw new AppError(409, 3208, "冻结金币余额异常");
    } else await refund(tx, item);
    await createUserNotification(tx, item.userId, success ? {
      type: "WITHDRAWAL", title: "提现已到账", content: `您的提现 ¥${(item.actualCents / 100).toFixed(2)} 已完成打款，支付流水号：${paymentReference}`,
    } : {
      type: "WITHDRAWAL", title: "提现打款失败", content: `本次打款未成功，${item.coins.toString()} 金币已退回可用余额。原因：${remark}`,
    });
    await tx.auditLog.create({ data: auditData(operatorId, success ? "withdrawal.complete" : "withdrawal.fail", id, request, { remark, paymentReference }) });
    return tx.withdrawal.findUniqueOrThrow({ where: { id } });
  }, { isolationLevel: "Serializable" });
}

export const getAlipayPayoutStatus = getAlipayPayoutReadiness;

function alipayErrorMessage(error: unknown) {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "支付宝接口请求失败";
  return new AppError(502, 3231, `支付宝返回结果未知，请先查询打款结果后再处理：${message.slice(0, 200)}`);
}

async function applyAlipayResult(
  operatorId: bigint,
  item: { id: string; status: WithdrawalStatus },
  result: AlipayPayoutResult,
  request: AuditRequest,
  settleConfirmedFailure: boolean,
) {
  const classification = classifyAlipayStatus(result.status);
  const paymentReference = result.payFundOrderId ?? result.orderId ?? result.outBizNo;
  if (classification === "SUCCESS") {
    const latest = await prisma.withdrawal.findUniqueOrThrow({ where: { id: item.id } });
    const withdrawal = latest.status === "COMPLETED"
      ? latest
      : await complete(operatorId, item.id, true, "支付宝打款成功", paymentReference, request);
    return { state: "SUCCESS" as const, result, withdrawal };
  }
  if (classification === "FAILED" && settleConfirmedFailure) {
    const latest = await prisma.withdrawal.findUniqueOrThrow({ where: { id: item.id } });
    const withdrawal = latest.status === "FAILED"
      ? latest
      : await complete(operatorId, item.id, false, `支付宝打款失败：${result.failureReason ?? result.status}`, paymentReference, request);
    return { state: "FAILED" as const, result, withdrawal };
  }

  const remark = classification === "FAILED"
    ? `支付宝发起结果为 ${result.status}，需查单确认后再退款`
    : `支付宝处理中（${result.status}），请稍后查询结果`;
  await prisma.$transaction(async (tx) => {
    await tx.withdrawal.updateMany({
      where: { id: item.id, status: "PAYING" },
      data: { paymentReference, reviewRemark: remark },
    });
    await tx.auditLog.create({
      data: auditData(operatorId, "withdrawal.alipay.pending", item.id, request, {
        outBizNo: result.outBizNo,
        orderId: result.orderId ?? null,
        payFundOrderId: result.payFundOrderId ?? null,
        status: result.status,
        traceId: result.traceId ?? null,
      }),
    });
  });
  return {
    state: classification === "FAILED" ? "NEEDS_QUERY" as const : "PROCESSING" as const,
    result,
    withdrawal: await prisma.withdrawal.findUniqueOrThrow({ where: { id: item.id } }),
  };
}

/** 审核通过后的支付宝单笔打款；商户单号由提现 ID 固定派生，重复点击仍保持支付宝侧幂等。 */
export async function payWithAlipay(operatorId: bigint, id: string, request: AuditRequest) {
  const item = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  if (item.channel !== "ALIPAY") throw new AppError(422, 3232, "该提现单不是支付宝收款渠道");
  if (item.status !== "PAYING") throw new AppError(409, 3233, "只有打款中的订单可以发起支付宝打款");
  try {
    const result = await transferToAlipay({
      withdrawalId: item.id,
      amountCents: item.actualCents,
      account: decrypt(item.accountCipher),
      realName: decrypt(item.realNameCipher),
    });
    return applyAlipayResult(operatorId, item, result, request, false);
  } catch (error) {
    throw alipayErrorMessage(error);
  }
}

/** 查询支付宝权威结果；只有明确失败才退回冻结金币，处理中和未知状态不改变余额。 */
export async function refreshAlipayPayout(operatorId: bigint, id: string, request: AuditRequest) {
  const item = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  if (item.channel !== "ALIPAY") throw new AppError(422, 3232, "该提现单不是支付宝收款渠道");
  if (item.status !== "PAYING") throw new AppError(409, 3234, "只有打款中的订单需要查询支付宝结果");
  try {
    const result = await queryAlipayTransfer(item.id);
    return applyAlipayResult(operatorId, item, result, request, true);
  } catch (error) {
    throw alipayErrorMessage(error);
  }
}

export function updateConfig(operatorId: bigint, data: Prisma.WithdrawalConfigUpdateInput, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const config = await tx.withdrawalConfig.update({ where: { id: 1 }, data });
    await tx.auditLog.create({ data: { operatorId, action: "withdrawal.config.update", method: request.method, path: request.path, targetType: "withdrawal_config", targetId: "1", ip: request.ip, userAgent: request.header("user-agent"), detail: JSON.parse(JSON.stringify(data, (_, value) => typeof value === "bigint" ? value.toString() : value)) } });
    return config;
  });
}

type BatchResultRow = { withdrawalId: string; success: boolean; paymentReference?: string; failureReason?: string };

/** 完整批次只要包含失败项即标记为部分成功，否则为全部完成。 */
export const deriveBatchStatus = (rows: BatchResultRow[]) => rows.some((row) => !row.success) ? "PARTIAL" as const : "COMPLETED" as const;

/** 使用日期和随机片段生成便于财务沟通、同时保持唯一性的批次号。 */
function newBatchNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `WB${date}${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** 创建批次时锁定的只能是已审核、尚未进入其他批次的 PAYING 订单。 */
export function createBatch(operatorId: bigint, input: { requestId: string; withdrawalIds: string[]; remark?: string }, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.withdrawalBatch.findUnique({ where: { requestId: input.requestId }, include: { items: true } });
    if (existing) return existing;
    const orders = await tx.withdrawal.findMany({ where: { id: { in: input.withdrawalIds }, status: "PAYING", batchItem: null } });
    if (orders.length !== input.withdrawalIds.length) throw new AppError(409, 3220, "部分订单不是打款中状态或已进入其他批次");
    const batch = await tx.withdrawalBatch.create({ data: {
      batchNo: newBatchNo(), requestId: input.requestId, orderCount: orders.length,
      totalCents: orders.reduce((sum, item) => sum + item.actualCents, 0), createdBy: operatorId, remark: input.remark,
      items: { create: orders.map((item) => ({ withdrawalId: item.id })) },
    }, include: { items: true } });
    await tx.auditLog.create({ data: { ...auditData(operatorId, "withdrawal.batch.create", batch.id, request, { batchNo: batch.batchNo, withdrawalIds: input.withdrawalIds }), targetType: "withdrawal_batch" } });
    return batch;
  }, { isolationLevel: "Serializable" });
}

export const listBatches = () => prisma.withdrawalBatch.findMany({
  take: 100, orderBy: { createdAt: "desc" }, include: { items: { include: { withdrawal: { select: { id: true, actualCents: true, accountMasked: true, channel: true, status: true, user: { select: { nickname: true, phone: true } } } } } } },
});

const activeAlipayBatches = new Set<string>();

function snapshotAuditRequest(request: AuditRequest): AuditRequest {
  const userAgent = request.header("user-agent");
  return {
    method: request.method,
    path: request.path,
    ip: request.ip,
    header: (name: string) => name.toLowerCase() === "user-agent" ? userAgent : undefined,
  } as AuditRequest;
}

async function updateAlipayBatchProgress(batchId: string) {
  const items = await prisma.withdrawalBatchItem.findMany({ where: { batchId }, select: { status: true } });
  const pending = items.filter((item) => item.status === "PENDING").length;
  const failed = items.filter((item) => item.status === "FAILED").length;
  const status = pending > 0 ? "PROCESSING" : failed > 0 ? "PARTIAL" : "COMPLETED";
  await prisma.withdrawalBatch.update({
    where: { id: batchId },
    data: { status, completedAt: pending > 0 ? null : new Date() },
  });
  return { failed, pending, success: items.length - pending - failed, total: items.length, status };
}

async function runAlipayBatch(
  operatorId: bigint,
  batchId: string,
  mode: "PAY" | "QUERY",
  request: AuditRequest,
) {
  try {
    const batch = await prisma.withdrawalBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { items: { include: { withdrawal: true }, orderBy: { id: "asc" } } },
    });
    for (const batchItem of batch.items) {
      if (batchItem.status !== "PENDING") continue;
      // 支付宝已返回终态、但进程在写入批次项前退出时，可从提现单恢复批次进度。
      if (batchItem.withdrawal.status === "COMPLETED" || batchItem.withdrawal.status === "FAILED") {
        await prisma.withdrawalBatchItem.update({
          where: { withdrawalId: batchItem.withdrawalId },
          data: {
            status: batchItem.withdrawal.status === "COMPLETED" ? "SUCCESS" : "FAILED",
            paymentReference: batchItem.withdrawal.paymentReference,
            failureReason: batchItem.withdrawal.status === "FAILED" ? batchItem.withdrawal.reviewRemark : null,
            processedAt: batchItem.withdrawal.completedAt ?? new Date(),
          },
        });
        continue;
      }
      if (batchItem.withdrawal.status !== "PAYING") {
        await prisma.withdrawalBatchItem.update({
          where: { withdrawalId: batchItem.withdrawalId },
          data: { failureReason: `提现单状态为 ${batchItem.withdrawal.status}，无法执行支付宝任务` },
        });
        continue;
      }
      try {
        const action = mode === "PAY"
          ? await payWithAlipay(operatorId, batchItem.withdrawalId, request)
          : await refreshAlipayPayout(operatorId, batchItem.withdrawalId, request);
        if (action.state === "SUCCESS" || action.state === "FAILED") {
          await prisma.withdrawalBatchItem.update({
            where: { withdrawalId: batchItem.withdrawalId },
            data: {
              status: action.state,
              paymentReference: action.withdrawal.paymentReference,
              failureReason: action.state === "FAILED" ? action.withdrawal.reviewRemark : null,
              processedAt: new Date(),
            },
          });
        } else {
          await prisma.withdrawalBatchItem.update({
            where: { withdrawalId: batchItem.withdrawalId },
            data: { failureReason: action.withdrawal.reviewRemark },
          });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 500) : "支付宝批量任务处理失败";
        await prisma.withdrawalBatchItem.update({
          where: { withdrawalId: batchItem.withdrawalId },
          data: { failureReason: reason },
        });
      }
    }
    const summary = await updateAlipayBatchProgress(batchId);
    await prisma.auditLog.create({ data: {
      ...auditData(operatorId, `withdrawal.batch.alipay.${mode.toLowerCase()}.finish`, batchId, request, summary),
      targetType: "withdrawal_batch",
    } });
  } finally {
    activeAlipayBatches.delete(batchId);
  }
}

/** 启动批量打款或批量查单；任务后台执行，避免大量支付宝请求阻塞浏览器连接。 */
export async function startAlipayBatch(
  operatorId: bigint,
  batchId: string,
  mode: "PAY" | "QUERY",
  request: AuditRequest,
) {
  const readiness = getAlipayPayoutReadiness();
  if (!readiness.configured) throw new AppError(503, 3230, `支付宝打款未配置完整：${readiness.missing.join("、")}`);
  if (activeAlipayBatches.has(batchId)) return { batchId, mode, started: false, running: true };

  const batch = await prisma.withdrawalBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { items: { include: { withdrawal: { select: { channel: true, status: true } } } } },
  });
  if (["CLOSED", "COMPLETED"].includes(batch.status)) throw new AppError(409, 3237, "当前批次已经结束，不能再次执行支付宝任务");
  const pendingItems = batch.items.filter((item) => item.status === "PENDING");
  if (!pendingItems.length) throw new AppError(409, 3238, "该批次没有待处理的打款中订单");
  if (pendingItems.some((item) => item.withdrawal.channel !== "ALIPAY")) throw new AppError(422, 3239, "批量支付宝打款仅支持全部为支付宝渠道的订单");

  await prisma.$transaction(async (tx) => {
    await tx.withdrawalBatch.update({ where: { id: batchId }, data: { status: "PROCESSING", completedAt: null } });
    await tx.auditLog.create({ data: {
      ...auditData(operatorId, `withdrawal.batch.alipay.${mode.toLowerCase()}.start`, batchId, request, { count: pendingItems.length }),
      targetType: "withdrawal_batch",
    } });
  });
  activeAlipayBatches.add(batchId);
  const auditRequest = snapshotAuditRequest(request);
  setImmediate(() => void runAlipayBatch(operatorId, batchId, mode, auditRequest).catch((error) => {
    console.error(`Alipay batch ${batchId} failed`, error);
    activeAlipayBatches.delete(batchId);
  }));
  return { batchId, mode, pending: pendingItems.length, started: true, running: true };
}

/** 未确认结果的批次可关闭；释放订单后可重新组批，关闭动作完整审计。 */
export function closeBatch(operatorId: bigint, batchId: string, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.withdrawalBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (!["DRAFT", "EXPORTED"].includes(batch.status)) throw new AppError(409, 3225, "当前批次状态不能关闭");
    await tx.withdrawalBatchItem.deleteMany({ where: { batchId } });
    const updated = await tx.withdrawalBatch.update({ where: { id: batchId }, data: { status: "CLOSED", closedAt: new Date() } });
    await tx.auditLog.create({ data: { ...auditData(operatorId, "withdrawal.batch.close", batchId, request, { batchNo: batch.batchNo }), targetType: "withdrawal_batch" } });
    return updated;
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  // 防止 Excel 将收款信息解释为公式，同时正确处理逗号、引号和换行。
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** 敏感导出会解密收款信息，并强制写入审计日志及导出时间。 */
export function exportBatch(operatorId: bigint, batchId: string, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.withdrawalBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: { include: { withdrawal: true } } } });
    if (batch.status === "CLOSED") throw new AppError(409, 3221, "已关闭批次不能导出");
    const header = ["batchNo", "withdrawalId", "channel", "realName", "account", "amountCents", "success", "paymentReference", "failureReason"];
    const lines = batch.items.map(({ withdrawal }) => [batch.batchNo, withdrawal.id, withdrawal.channel, decrypt(withdrawal.realNameCipher), decrypt(withdrawal.accountCipher), withdrawal.actualCents, "", "", ""].map(csvCell).join(","));
    await tx.withdrawalBatch.update({ where: { id: batchId }, data: { status: batch.status === "DRAFT" ? "EXPORTED" : batch.status, exportedAt: new Date() } });
    await tx.auditLog.create({ data: { ...auditData(operatorId, "withdrawal.batch.export", batchId, request, { batchNo: batch.batchNo, count: batch.orderCount }), targetType: "withdrawal_batch" } });
    return { filename: `${batch.batchNo}.csv`, content: `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}` };
  });
}

/** 导入预检完全只读，返回逐行错误，确认前不会改变订单或余额。 */
export async function previewBatchResults(batchId: string, rows: BatchResultRow[]) {
  const batch = await prisma.withdrawalBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: true } });
  const itemMap = new Map(batch.items.map((item) => [item.withdrawalId, item]));
  const preview = rows.map((row, index) => {
    const item = itemMap.get(row.withdrawalId);
    const errors: string[] = [];
    if (!item) errors.push("订单不属于该批次");
    else if (item.status !== "PENDING") errors.push("该订单结果已经处理");
    return { row: index + 1, ...row, valid: errors.length === 0, errors };
  });
  if (rows.length !== batch.items.length) preview.push({ row: 0, withdrawalId: "", success: false, valid: false, errors: [`结果数量应为 ${batch.items.length} 条`] });
  return { batchId, total: rows.length, valid: preview.filter((item) => item.valid).length, invalid: preview.filter((item) => !item.valid).length, rows: preview };
}

/** 确认导入在单个串行化事务中结算余额；requestId 使支付结果重复提交保持幂等。 */
export function confirmBatchResults(operatorId: bigint, batchId: string, requestId: string, rows: BatchResultRow[], request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.withdrawalBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: { include: { withdrawal: true } } } });
    if (batch.resultRequestId === requestId) return batch;
    if (batch.resultRequestId) throw new AppError(409, 3222, "该批次已经确认过其他结果文件");
    if (rows.length !== batch.items.length) throw new AppError(422, 3224, `必须一次提交完整的 ${batch.items.length} 条批次结果`);
    const itemMap = new Map(batch.items.map((item) => [item.withdrawalId, item]));
    for (const row of rows) {
      const item = itemMap.get(row.withdrawalId);
      if (!item || item.status !== "PENDING" || item.withdrawal.status !== "PAYING") throw new AppError(409, 3223, `订单 ${row.withdrawalId} 不可处理`);
      if (row.success) {
        const changed = await tx.user.updateMany({ where: { id: item.withdrawal.userId, frozenCoinBalance: { gte: item.withdrawal.coins } }, data: { frozenCoinBalance: { decrement: item.withdrawal.coins } } });
        if (changed.count !== 1) throw new AppError(409, 3208, "冻结金币余额异常");
      } else await refund(tx, item.withdrawal);
      await tx.withdrawal.update({ where: { id: row.withdrawalId }, data: { status: row.success ? "COMPLETED" : "FAILED", paymentReference: row.paymentReference, reviewRemark: row.failureReason ?? "批次打款成功", completedAt: new Date() } });
      await tx.withdrawalBatchItem.update({ where: { withdrawalId: row.withdrawalId }, data: { status: row.success ? "SUCCESS" : "FAILED", paymentReference: row.paymentReference, failureReason: row.failureReason, processedAt: new Date() } });
      await createUserNotification(tx, item.withdrawal.userId, row.success ? {
        type: "WITHDRAWAL", title: "提现已到账", content: `您的提现 ¥${(item.withdrawal.actualCents / 100).toFixed(2)} 已完成打款，支付流水号：${row.paymentReference}`,
      } : {
        type: "WITHDRAWAL", title: "提现打款失败", content: `本次打款未成功，${item.withdrawal.coins.toString()} 金币已退回可用余额。原因：${row.failureReason}`,
      });
    }
    const failed = rows.filter((row) => !row.success).length;
    const status = deriveBatchStatus(rows);
    const updated = await tx.withdrawalBatch.update({ where: { id: batchId }, data: { status, resultRequestId: requestId, completedAt: new Date() }, include: { items: true } });
    await tx.auditLog.create({ data: { ...auditData(operatorId, "withdrawal.batch.results.confirm", batchId, request, { requestId, rows: rows.length, failed }), targetType: "withdrawal_batch" } });
    return updated;
  }, { isolationLevel: "Serializable" });
}

/** 财务看板统一使用人民币分，避免浮点金额误差。 */
export async function financeDashboard() {
  const timeoutBefore = new Date(Date.now() - 24 * 60 * 60_000);
  const [today, byStatus, timeoutCount, abnormalBatches] = await Promise.all([
    prisma.withdrawal.aggregate({ where: { createdAt: { gte: chinaDayRange().start } }, _sum: { actualCents: true }, _count: true }),
    prisma.withdrawal.groupBy({ by: ["status"], _sum: { actualCents: true }, _count: true }),
    prisma.withdrawal.count({ where: { status: { in: ["PENDING", "PAYING"] }, createdAt: { lt: timeoutBefore } } }),
    prisma.withdrawalBatch.count({ where: { status: "PARTIAL" } }),
  ]);
  return { today: { count: today._count, cents: today._sum.actualCents ?? 0 }, byStatus, timeoutCount, abnormalBatches };
}

/** 扫描超过 24 小时未处理的提现，为每个订单创建一次待处理风险预警。 */
export async function scanWithdrawalTimeouts() {
  const overdue = await prisma.withdrawal.findMany({
    where: { status: { in: ["PENDING", "PAYING"] }, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
    select: { id: true, userId: true, status: true }, take: 500,
  });
  let created = 0;
  for (const item of overdue) {
    const ruleCode = `WITHDRAWAL_TIMEOUT_${item.id}`;
    const exists = await prisma.riskEvent.findFirst({ where: { ruleCode, status: "PENDING" } });
    if (!exists) {
      await prisma.riskEvent.create({ data: { userId: item.userId, ruleCode, level: "HIGH", title: "提现订单超过 24 小时未处理", detail: { withdrawalId: item.id, status: item.status } } });
      created++;
    }
  }
  return created;
}
