import { Router } from "express";
import { AppError, ok } from "../../lib/http.js";
import { authenticate, denyAgentWrites, permit, permitAny, verifySecondaryPassword } from "../../middleware/auth.js";
import { validate } from "../../middleware/request.js";
import {
  adjustCoinsSchema,
  adSettlementListSchema,
  createLevelOneAgentSchema,
  settleAdRewardSchema,
  ledgerListQuerySchema,
  roleIdSchema,
  updateRolePermissionsSchema,
  updateAdRewardConfigSchema,
  updateAgentShareRateSchema,
  updateUserAdShareSchema,
  updateUserStatusSchema,
  userIdSchema,
  userListQuerySchema,
  type LedgerListQuery,
  type UserListQuery,
} from "./admin.schema.js";
import * as adminService from "./admin.service.js";
import {
  rewardListQuerySchema,
  rewardRuleCodeSchema,
  updateRewardRuleSchema,
  type RewardListQuery,
} from "../reward/reward.schema.js";
import * as rewardService from "../reward/reward.service.js";
import {
  completeWithdrawalSchema,
  batchIdSchema,
  batchResultsSchema,
  createBatchSchema,
  reviewWithdrawalSchema,
  updateWithdrawalConfigSchema,
  withdrawalIdSchema,
  withdrawalListQuerySchema,
  type WithdrawalListQuery,
} from "../withdrawal/withdrawal.schema.js";
import * as withdrawalService from "../withdrawal/withdrawal.service.js";
import {
  announcementSchema,
  adEventListQuerySchema,
  configKeySchema,
  documentSchema,
  operationIdSchema,
  slotSchema,
  systemConfigSchema,
  versionSchema,
} from "../operation/operation.schema.js";
import * as operationService from "../operation/operation.service.js";
import * as adRuntimeService from "../operation/ad-runtime.service.js";
import {
  feedbackHandleSchema,
  idSchema as safetyIdSchema,
  listSchema as safetyListSchema,
  reportHandleSchema,
  riskPolicySchema,
  riskHandleSchema,
  userRiskSchema,
  type ListQuery as SafetyListQuery,
} from "../safety/safety.schema.js";
import * as safetyService from "../safety/safety.service.js";
import * as reconciliationService from "../reconciliation/reconciliation.service.js";
import { reconciliationScheduleSchema } from "../reconciliation/reconciliation.schema.js";
import { listCallbackLogs } from "../webhook/webhook.service.js";
import { getAgentDescendantIds } from "./agent-scope.js";
import { adminDramaListQuerySchema, type AdminDramaListQuery } from "../content/content.schema.js";
import * as contentAdminService from "../content/content.admin.service.js";
import { imageUpload, removeStoredImage, storeImage } from "../../services/local-image-storage.js";
import { sendNotificationSchema } from "../notification/notification.schema.js";
import * as notificationService from "../notification/notification.service.js";
import { productModules } from "../../generated/product.generated.js";

const router = Router();

// 后台接口先统一认证，再由每个接口声明细粒度权限码，便于菜单和按钮共同复用。
router.use(authenticate);

/** Vben 登录后通过该接口初始化菜单和按钮权限。 */
router.get("/access-codes", (req, res) => ok(res, req.auth!.permissions));

// 代理是整个中后台的只读角色；服务端总闸门防止绕过前端按钮直接提交写请求。
router.use(denyAgentWrites);

/** 后台菜单隐藏之外再做服务端兜底，防止通过旧书签或手工请求访问已关闭模块。 */
const adminModuleRules: Array<{ enabled: boolean; paths: RegExp[] }> = [
  { enabled: productModules.shortDrama, paths: [/^\/content-center(?:\/|$)/, /^\/sdk-health(?:\/|$)/] },
  { enabled: productModules.advertising, paths: [/^\/ad-(?:reward|callback|events|runtime)/, /^\/users\/[^/]+\/ad-share-rate$/] },
  { enabled: productModules.rewards, paths: [/^\/ad-reward/, /^\/coin-ledgers$/, /^\/reward-rules(?:\/|$)/, /^\/check-in-records(?:\/|$)/] },
  { enabled: productModules.invitations, paths: [/^\/agent-overview$/, /^\/invite-relations(?:\/|$)/, /^\/users\/[^/]+\/(?:agent-share-rate|team)$/] },
  { enabled: productModules.withdrawals, paths: [/^\/finance-dashboard$/, /^\/reconciliation/, /^\/withdrawal/] },
  { enabled: productModules.alipayPayout, paths: [/^\/alipay-payout/, /^\/withdrawals\/[^/]+\/alipay-/, /^\/withdrawal-batches\/[^/]+\/alipay-/] },
];
router.use((req, _res, next) => {
  const blocked = adminModuleRules.some((rule) => !rule.enabled && rule.paths.some((pattern) => pattern.test(req.path)));
  return blocked ? next(new AppError(404, 1004, "接口不存在")) : next();
});

/** GET /dashboard：运营看板聚合数据；需要 dashboard:read。 */
router.get("/dashboard", permit("dashboard:read"), async (req, res) => {
  return ok(res, await adminService.getDashboard(req.auth!.accountType === "AGENT" ? req.auth!.userId : undefined));
});

/** GET /content-center：分页查看本地短剧快照、第三方 ID 映射和播放边界。 */
router.get("/content-center", permit("operation:read"), validate(adminDramaListQuerySchema, "query"), async (_req, res) =>
  ok(res, await contentAdminService.getContentCenter(res.locals.validatedQuery as AdminDramaListQuery)),
);

/** POST /content-center/sync：同步最新 50 部穿山甲内容快照并记录审计。 */
router.post("/content-center/sync", permit("operation:update"), async (req, res) =>
  ok(res, await contentAdminService.syncLatestPangleDramas(req.auth!.userId, req), "最新短剧内容已同步"),
);

/** GET /sdk-health：只返回配置是否齐全，不泄露任何密钥原文。 */
router.get("/sdk-health", permit("operation:read"), async (_req, res) =>
  ok(res, await contentAdminService.getSdkHealth()),
);

/** POST /sdk-health/content-probe：管理员手动探测穿山甲内容接口。 */
router.post("/sdk-health/content-probe", permit("operation:read"), async (_req, res) =>
  ok(res, await contentAdminService.probePangleContent()),
);

/** GET /agent-overview：代理专属成员、广告收入、佣金、趋势和成员贡献排行。 */
router.get("/agent-overview", permit("agent:readonly"), async (req, res) => {
  return ok(res, await adminService.getAgentOverview(req.auth!.userId));
});

/** GET /users：分页搜索用户；需要 user:read。 */
router.get(
  "/users",
  permit("user:read"),
  validate(userListQuerySchema, "query"),
  async (req, res) => {
    return ok(
      res,
      await adminService.listUsers(res.locals.validatedQuery as UserListQuery, req.auth!.accountType === "AGENT" ? req.auth!.userId : undefined),
    );
  },
);

/** POST /users：管理员创建无需上级邀请码的代理账号；需要 user:update。 */
router.post(
  "/users",
  permit("user:update"),
  verifySecondaryPassword,
  validate(createLevelOneAgentSchema),
  async (req, res) => ok(res, await adminService.createLevelOneAgent(req.auth!.userId, req.body, req), "代理创建成功", 201),
);

/** PUT /users/:id/ad-share-rate：配置用户独立广告分成；null 表示继承全局。 */
router.put("/users/:id/ad-share-rate", permit("user:update"), verifySecondaryPassword, validate(userIdSchema, "params"), validate(updateUserAdShareSchema), async (req, res) =>
  ok(res, await adminService.updateUserAdShare(req.auth!.userId, BigInt(String(req.params.id)), req.body.shareRateBps, req), "用户分成比例已更新"),
);

/** PUT /users/:id/agent-share-rate：调整管理员创建代理的无限下级返佣比例。 */
router.put("/users/:id/agent-share-rate", permit("user:update"), verifySecondaryPassword, validate(userIdSchema, "params"), validate(updateAgentShareRateSchema), async (req, res) =>
  ok(res, await adminService.updateAgentShareRate(req.auth!.userId, BigInt(String(req.params.id)), req.body.agentShareRateBps, req), "代理分成比例已更新"),
);

/** GET /users/:id：获取用户详情、角色和业务数量；需要 user:read。 */
router.get(
  "/users/:id",
  permit("user:read"),
  validate(userIdSchema, "params"),
  async (req, res) => {
    return ok(
      res,
      await adminService.getUserDetail(BigInt(String(req.params.id)), req.auth!.accountType === "AGENT" ? req.auth!.userId : undefined),
    );
  },
);

/** PATCH /users/:id/status：启用或禁用用户并记录审计日志；需要 user:update。 */
router.patch(
  "/users/:id/status",
  permit("user:update"),
  validate(userIdSchema, "params"),
  validate(updateUserStatusSchema),
  async (req, res) => {
    const user = await adminService.updateUserStatus(
      req.auth!.userId,
      BigInt(String(req.params.id)),
      req.body.status,
      req,
    );
    return ok(res, user, "状态已更新");
  },
);

/** POST /users/:id/coin-adjustments：人工增减金币，余额、流水、审计同事务；需要 coin:adjust。 */
router.post(
  "/users/:id/coin-adjustments",
  permit("coin:adjust"),
  verifySecondaryPassword,
  validate(userIdSchema, "params"),
  validate(adjustCoinsSchema),
  async (req, res) => {
    return ok(
      res,
      await adminService.adjustUserCoins(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body.amount,
        req.body.reason,
        req,
      ),
      "金币调整成功",
      201,
    );
  },
);

/** GET /reconciliation-schedule：获取自动对账开关和每日执行时间；需要 reconciliation:read。 */
router.get(
  "/reconciliation-schedule",
  permit("reconciliation:read"),
  async (_req, res) => ok(res, await reconciliationService.getSchedule()),
);

/** PUT /reconciliation-schedule：更新自动对账配置并记录审计日志；需要 reconciliation:run。 */
router.put(
  "/reconciliation-schedule",
  permit("reconciliation:run"),
  validate(reconciliationScheduleSchema),
  async (req, res) => ok(res, await reconciliationService.updateSchedule(req.auth!.userId, req.body, req), "自动对账配置已更新"),
);

/** GET /coin-ledgers：分页查询不可变金币流水，可按用户筛选；需要 coin:read。 */
router.get(
  "/coin-ledgers",
  permit("coin:read"),
  validate(ledgerListQuerySchema, "query"),
  async (_req, res) => {
    return ok(
      res,
      await adminService.listCoinLedgers(
        res.locals.validatedQuery as LedgerListQuery,
      ),
    );
  },
);

/** GET /withdrawals：分页筛选提现订单；需要 withdrawal:read。 */
router.get(
  "/withdrawals",
  permit("withdrawal:read"),
  validate(withdrawalListQuerySchema, "query"),
  async (_req, res) => {
    return ok(
      res,
      await withdrawalService.listAdmin(
        res.locals.validatedQuery as WithdrawalListQuery,
      ),
    );
  },
);
/** GET /withdrawals/:id：查看解密后的收款信息并记录敏感读取审计；需要 withdrawal:review。 */
router.get(
  "/withdrawals/:id",
  permit("withdrawal:review"),
  verifySecondaryPassword,
  validate(withdrawalIdSchema, "params"),
  async (req, res) => {
    return ok(
      res,
      await withdrawalService.getAdminDetail(
        req.auth!.userId,
        String(req.params.id),
        req,
      ),
    );
  },
);
/** POST /withdrawals/:id/review：通过或拒绝待审核订单；需要 withdrawal:review。 */
router.post(
  "/withdrawals/:id/review",
  permit("withdrawal:review"),
  verifySecondaryPassword,
  validate(withdrawalIdSchema, "params"),
  validate(reviewWithdrawalSchema),
  async (req, res) => {
    return ok(
      res,
      await withdrawalService.review(
        req.auth!.userId,
        String(req.params.id),
        req.body.approved,
        req.body.remark,
        req,
      ),
      "审核完成",
    );
  },
);
/** POST /withdrawals/:id/complete：确认打款成功或失败；需要 withdrawal:review。 */
router.post(
  "/withdrawals/:id/complete",
  permit("withdrawal:review"),
  verifySecondaryPassword,
  validate(withdrawalIdSchema, "params"),
  validate(completeWithdrawalSchema),
  async (req, res) => {
    return ok(
      res,
      await withdrawalService.complete(
        req.auth!.userId,
        String(req.params.id),
        req.body.success,
        req.body.remark,
        req.body.paymentReference,
        req,
      ),
      "打款结果已确认",
    );
  },
);
/** GET /alipay-payout/status：只返回支付宝打款配置是否就绪，不返回任何密钥或证书内容。 */
router.get("/alipay-payout/status", permitAny("withdrawal:read", "withdrawal:batch:read"), async (_req, res) =>
  ok(res, withdrawalService.getAlipayPayoutStatus()),
);

/** POST /withdrawals/:id/alipay-transfer：向审核通过的支付宝提现单发起真实打款。 */
router.post(
  "/withdrawals/:id/alipay-transfer",
  permit("withdrawal:review"),
  verifySecondaryPassword,
  validate(withdrawalIdSchema, "params"),
  async (req, res) => ok(res, await withdrawalService.payWithAlipay(req.auth!.userId, String(req.params.id), req), "支付宝打款请求已处理"),
);

/** POST /withdrawals/:id/alipay-query：查询支付宝权威结果并同步提现状态。 */
router.post(
  "/withdrawals/:id/alipay-query",
  permit("withdrawal:review"),
  verifySecondaryPassword,
  validate(withdrawalIdSchema, "params"),
  async (req, res) => ok(res, await withdrawalService.refreshAlipayPayout(req.auth!.userId, String(req.params.id), req), "支付宝打款状态已同步"),
);

/** GET /withdrawal-config：获取中后台提现规则；需要 withdrawal:read。 */
router.get("/withdrawal-config", permit("withdrawal:read"), async (_req, res) =>
  ok(res, await withdrawalService.getConfig()),
);
/** PUT /withdrawal-config：更新提现规则并写入审计日志；需要 withdrawal:config。 */
router.put(
  "/withdrawal-config",
  permit("withdrawal:config"),
  verifySecondaryPassword,
  validate(updateWithdrawalConfigSchema),
  async (req, res) => {
    return ok(
      res,
      await withdrawalService.updateConfig(req.auth!.userId, req.body, req),
      "提现规则已更新",
    );
  },
);

/** GET /finance-dashboard：统计提现金额、成功率、超时订单和异常批次；需要 withdrawal:read。 */
router.get("/finance-dashboard", permit("withdrawal:read"), async (_req, res) =>
  ok(res, await withdrawalService.financeDashboard()),
);

/** GET /withdrawal-batches：查询最近 100 个打款批次及订单结果；需要 withdrawal:batch:read。 */
router.get("/withdrawal-batches", permit("withdrawal:batch:read"), async (_req, res) =>
  ok(res, await withdrawalService.listBatches()),
);

/** POST /withdrawal-batches：将 PAYING 订单加入唯一批次；需二次密码和 withdrawal:batch:manage。 */
router.post(
  "/withdrawal-batches",
  permit("withdrawal:batch:manage"),
  verifySecondaryPassword,
  validate(createBatchSchema),
  async (req, res) => ok(res, await withdrawalService.createBatch(req.auth!.userId, req.body, req), "批次已创建", 201),
);

/** GET /withdrawal-batches/:id/export：导出含完整收款信息的 CSV，并记录敏感审计；需二次密码。 */
/** 后台异步逐笔发起支付宝批量打款。 */
router.post(
  "/withdrawal-batches/:id/alipay-pay",
  permit("withdrawal:batch:manage"),
  verifySecondaryPassword,
  validate(batchIdSchema, "params"),
  async (req, res) => ok(
    res,
    await withdrawalService.startAlipayBatch(req.auth!.userId, String(req.params.id), "PAY", req),
    "支付宝批量打款任务已启动",
    202,
  ),
);

/** 后台异步查询批次内尚未确认结果的支付宝订单。 */
router.post(
  "/withdrawal-batches/:id/alipay-query",
  permit("withdrawal:batch:manage"),
  verifySecondaryPassword,
  validate(batchIdSchema, "params"),
  async (req, res) => ok(
    res,
    await withdrawalService.startAlipayBatch(req.auth!.userId, String(req.params.id), "QUERY", req),
    "支付宝批量查单任务已启动",
    202,
  ),
);

router.get(
  "/withdrawal-batches/:id/export",
  permit("withdrawal:batch:export"),
  verifySecondaryPassword,
  validate(batchIdSchema, "params"),
  async (req, res) => {
    // 文件导出是带审计的敏感动作，忽略浏览器条件缓存头，确保每次返回完整文件。
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];
    const file = await withdrawalService.exportBatch(req.auth!.userId, String(req.params.id), req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    // 敏感导出每次都需要重新鉴权并记录审计，禁止浏览器使用 304 缓存结果。
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.removeHeader("ETag");
    return res.send(file.content);
  },
);

/** POST /withdrawal-batches/:id/close：关闭未处理批次并释放订单；需二次密码。 */
router.post(
  "/withdrawal-batches/:id/close",
  permit("withdrawal:batch:manage"),
  verifySecondaryPassword,
  validate(batchIdSchema, "params"),
  async (req, res) => ok(res, await withdrawalService.closeBatch(req.auth!.userId, String(req.params.id), req), "批次已关闭"),
);

/** POST /withdrawal-batches/:id/results/preview：只读校验支付结果，不改变订单或余额。 */
router.post(
  "/withdrawal-batches/:id/results/preview",
  permit("withdrawal:batch:manage"),
  validate(batchIdSchema, "params"),
  validate(batchResultsSchema),
  async (req, res) => ok(res, await withdrawalService.previewBatchResults(String(req.params.id), req.body.rows)),
);

/** POST /withdrawal-batches/:id/results/confirm：事务化确认整批结果；需二次密码，requestId 保证幂等。 */
router.post(
  "/withdrawal-batches/:id/results/confirm",
  permit("withdrawal:batch:manage"),
  verifySecondaryPassword,
  validate(batchIdSchema, "params"),
  validate(batchResultsSchema),
  async (req, res) => ok(res, await withdrawalService.confirmBatchResults(req.auth!.userId, String(req.params.id), req.body.requestId, req.body.rows, req), "批次结果已确认"),
);

/** GET /ad-reward-config：读取全局广告分成比例。 */
router.get("/ad-reward-config", permit("reward:read"), async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return ok(res, await adminService.getAdRewardConfig());
});
/** PUT /ad-reward-config：更新全局广告分成比例并审计。 */
router.put("/ad-reward-config", permit("reward:update"), verifySecondaryPassword, validate(updateAdRewardConfigSchema), async (req, res) =>
  ok(res, await adminService.updateAdRewardConfig(req.auth!.userId, req.body, req), "全局广告分成已更新"),
);
/** POST /ad-reward-settlements：按人民币收入手动验证单次广告收益结算；requestId 幂等。 */
router.post("/ad-reward-settlements", permit("reward:update"), verifySecondaryPassword, validate(settleAdRewardSchema), async (req, res) =>
  ok(res, await adminService.settleAdReward(req.auth!.userId, req.body, req), "广告收益结算成功", 201),
);
/** GET /ad-reward-settlements：分页查询广告收入、用户净收益及两级返佣快照。 */
router.get("/ad-reward-settlements", permitAny("reward:read", "agent:reward:read"), validate(adSettlementListSchema, "query"), async (req, res) =>
  ok(res, await adminService.listAdRewardSettlements(res.locals.validatedQuery, req.auth!.accountType === "AGENT" ? req.auth!.userId : undefined)),
);
/** GET /ad-reward-dashboard：读取广告收入、分配金额和平台留存汇总。 */
router.get("/ad-reward-dashboard", permitAny("reward:read", "agent:reward:read"), async (req, res) => ok(res, await adminService.getAdRewardDashboard(req.auth!.accountType === "AGENT" ? req.auth!.userId : undefined)));
/** GET /ad-callback-logs：分页查询广告平台回调处理日志。 */
router.get("/ad-callback-logs", permit("reward:update"), validate(adSettlementListSchema.omit({ userId: true }), "query"), async (_req, res) =>
  ok(res, await listCallbackLogs(res.locals.validatedQuery)),
);
/** GET /users/:id/team：查询指定用户向下两级邀请团队及返佣贡献。 */
router.get("/users/:id/team", permit("user:read"), validate(userIdSchema, "params"), async (req, res) =>
  ok(res, await adminService.getUserTeam(BigInt(req.params.id as string), req.auth!.accountType === "AGENT" ? req.auth!.userId : undefined)),
);

/** GET /reward-rules：查询全部注册、邀请和签到奖励规则；需要 reward:read。 */
router.get("/reward-rules", permit("reward:read"), async (_req, res) =>
  ok(res, await rewardService.listRewardRules()),
);
/** PUT /reward-rules/:code：更新奖励金额和状态并记录审计；需要 reward:update。 */
router.put(
  "/reward-rules/:code",
  permit("reward:update"),
  validate(rewardRuleCodeSchema, "params"),
  validate(updateRewardRuleSchema),
  async (req, res) => {
    return ok(
      res,
      await rewardService.updateRewardRule(
        req.auth!.userId,
        String(req.params.code),
        req.body,
        req,
      ),
      "奖励规则已更新",
    );
  },
);
/** GET /invite-relations：分页查询邀请人与受邀用户关系；需要 reward:read。 */
router.get(
  "/invite-relations",
  permit("reward:read"),
  validate(rewardListQuerySchema, "query"),
  async (req, res) => {
    const allowedUserIds = req.auth!.accountType === "AGENT" ? await getAgentDescendantIds(req.auth!.userId) : undefined;
    return ok(
      res,
      await rewardService.listInvites(
        res.locals.validatedQuery as RewardListQuery,
        allowedUserIds,
      ),
    );
  },
);
/** GET /check-ins：分页查询签到日期、连续天数及实际奖励；需要 reward:read。 */
router.get(
  "/check-ins",
  permit("reward:read"),
  validate(rewardListQuerySchema, "query"),
  async (req, res) => {
    const allowedUserIds = req.auth!.accountType === "AGENT" ? await getAgentDescendantIds(req.auth!.userId) : undefined;
    return ok(
      res,
      await rewardService.listCheckIns(
        res.locals.validatedQuery as RewardListQuery,
        allowedUserIds,
      ),
    );
  },
);

/** GET /permissions：查询所有细粒度权限点；需要 rbac:read。 */
router.get("/permissions", permit("rbac:read"), async (_req, res) =>
  ok(res, await adminService.listPermissions()),
);
/** GET /roles：查询角色、权限和成员数量；需要 rbac:read。 */
router.get("/roles", permit("rbac:read"), async (_req, res) =>
  ok(res, await adminService.listRoles()),
);
/** PUT /roles/:id/permissions：覆盖自定义角色权限；需要 rbac:update。 */
router.put(
  "/roles/:id/permissions",
  permit("rbac:update"),
  verifySecondaryPassword,
  validate(roleIdSchema, "params"),
  validate(updateRolePermissionsSchema),
  async (req, res) => {
    return ok(
      res,
      await adminService.updateRolePermissions(
        Number(req.params.id),
        req.body.permissionIds,
      ),
      "角色权限已更新",
    );
  },
);
/** GET /administrators：查询拥有后台角色的账号；需要 admin:read。 */
router.get("/administrators", permit("admin:read"), async (_req, res) =>
  ok(res, await adminService.listAdmins()),
);
/** GET /audit-logs：查询最近 100 条敏感操作审计记录；需要 audit:read。 */
router.get("/audit-logs", permit("audit:read"), async (_req, res) =>
  ok(res, await adminService.listAuditLogs()),
);

/** POST /uploads/images：上传单张 5MB 以内图片并登记资产；需要 upload:create。 */
router.post(
  "/uploads/images",
  permit("upload:create"),
  imageUpload.single("file"),
  async (req, res) => {
    if (!req.file) throw new AppError(422, 3301, "未接收到支持的图片文件");
    const stored = await storeImage(req.file, "operations");
    try {
      return ok(res, await operationService.recordUpload(req.auth!.userId, stored), "上传成功", 201);
    } catch (error) {
      await removeStoredImage(stored.url);
      throw error;
    }
  },
);
/** GET /operation-slots：查询全部运营位；需要 operation:read。 */
router.get("/operation-slots", permit("operation:read"), async (_req, res) =>
  ok(res, await operationService.listSlots()),
);
/** POST /operation-slots：创建轮播、推荐位或启动弹窗；需要 operation:update。 */
router.post(
  "/operation-slots",
  permit("operation:update"),
  validate(slotSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.createSlot(req.auth!.userId, req.body, req),
      "运营位已创建",
      201,
    ),
);
/** PUT /operation-slots/:id：更新运营位展示、跳转、排序和有效期；需要 operation:update。 */
router.put(
  "/operation-slots/:id",
  permit("operation:update"),
  validate(operationIdSchema, "params"),
  validate(slotSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.updateSlot(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "运营位已更新",
    ),
);
/** DELETE /operation-slots/:id：删除运营位；需要 operation:update。 */
router.delete(
  "/operation-slots/:id",
  permit("operation:update"),
  validate(operationIdSchema, "params"),
  async (req, res) =>
    ok(
      res,
      await operationService.deleteSlot(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req,
      ),
      "运营位已删除",
    ),
);

/** POST /notifications：向全部活跃用户或指定手机号发送站内信；需要二次密码。 */
router.post(
  "/notifications",
  permit("operation:update"),
  verifySecondaryPassword,
  validate(sendNotificationSchema),
  async (req, res) => ok(res, await notificationService.sendFromAdmin(req.auth!.userId, req.body, req), "站内信已发送", 201),
);

/** GET /announcements：查询全部公告；需要 operation:read。 */
router.get("/announcements", permit("operation:read"), async (_req, res) =>
  ok(res, await operationService.listAnnouncements()),
);
/** POST /announcements：创建公告草稿或已发布公告；需要 operation:update。 */
router.post(
  "/announcements",
  permit("operation:update"),
  validate(announcementSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.createAnnouncement(
        req.auth!.userId,
        req.body,
        req,
      ),
      "公告已创建",
      201,
    ),
);
/** PUT /announcements/:id：更新公告内容和发布状态；需要 operation:update。 */
router.put(
  "/announcements/:id",
  permit("operation:update"),
  validate(operationIdSchema, "params"),
  validate(announcementSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.updateAnnouncement(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "公告已更新",
    ),
);
/** DELETE /announcements/:id：删除公告；需要 operation:update。 */
router.delete(
  "/announcements/:id",
  permit("operation:update"),
  validate(operationIdSchema, "params"),
  async (req, res) =>
    ok(
      res,
      await operationService.deleteAnnouncement(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req,
      ),
      "公告已删除",
    ),
);

/** GET /system-configs：查询所有 App 参数与功能开关；需要 operation:read。 */
router.get("/system-configs", permit("operation:read"), async (_req, res) =>
  ok(res, await operationService.listConfigs()),
);
/** GET /ad-runtime-config：广告运营配置表单专用接口。 */
router.get("/ad-runtime-config", permit("operation:read"), async (_req, res) =>
  ok(res, await adRuntimeService.getAdRuntimeConfig()),
);
/** GET /ad-events：查看客户端广告生命周期事件。 */
router.get("/ad-events", permit("operation:read"), validate(adEventListQuerySchema, "query"), async (_req, res) =>
  ok(res, await adRuntimeService.listAdClientEvents(res.locals.validatedQuery)),
);
router.get("/ad-events/summary", permit("operation:read"), async (_req, res) =>
  ok(res, await adRuntimeService.getAdClientEventSummary()),
);
/** PUT /system-configs/:key：以 JSON 更新指定配置；需要 operation:update。 */
router.put(
  "/system-configs/:key",
  permit("operation:update"),
  validate(configKeySchema, "params"),
  validate(systemConfigSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.updateConfig(
        req.auth!.userId,
        String(req.params.key),
        req.body,
        req,
      ),
      "系统配置已更新",
    ),
);

/** GET /app-documents：查询协议和帮助文档的所有版本；需要 operation:read。 */
router.get("/app-documents", permit("operation:read"), async (_req, res) =>
  ok(res, await operationService.listDocuments()),
);
/** POST /app-documents：创建协议或帮助文档版本；需要 operation:update。 */
router.post(
  "/app-documents",
  permit("operation:update"),
  validate(documentSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.createDocument(req.auth!.userId, req.body, req),
      "文档已创建",
      201,
    ),
);
/** PUT /app-documents/:id：更新协议内容和发布状态；需要 operation:update。 */
router.put(
  "/app-documents/:id",
  permit("operation:update"),
  validate(operationIdSchema, "params"),
  validate(documentSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.updateDocument(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "文档已更新",
    ),
);

/** GET /app-versions：查询 Android/iOS 版本策略；需要 operation:read。 */
router.get("/app-versions", permit("operation:read"), async (_req, res) =>
  ok(res, await operationService.listVersions()),
);
/** POST /app-versions：创建 App 发布版本；需要 operation:update。 */
router.post(
  "/app-versions",
  permit("operation:update"),
  validate(versionSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.createVersion(req.auth!.userId, req.body, req),
      "版本已创建",
      201,
    ),
);
/** PUT /app-versions/:id：更新发布、强制升级和灰度策略；需要 operation:update。 */
router.put(
  "/app-versions/:id",
  permit("operation:update"),
  validate(operationIdSchema, "params"),
  validate(versionSchema),
  async (req, res) =>
    ok(
      res,
      await operationService.updateVersion(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "版本已更新",
    ),
);

/** GET /feedback：分页查询反馈工单；需要 feedback:read。 */ router.get(
  "/feedback",
  permit("feedback:read"),
  validate(safetyListSchema, "query"),
  async (_req, res) =>
    ok(
      res,
      await safetyService.listFeedback(
        res.locals.validatedQuery as SafetyListQuery,
      ),
    ),
);
/** PUT /feedback/:id：回复、备注并流转工单状态；需要 feedback:update。 */ router.put(
  "/feedback/:id",
  permit("feedback:update"),
  validate(safetyIdSchema, "params"),
  validate(feedbackHandleSchema),
  async (req, res) =>
    ok(
      res,
      await safetyService.handleFeedback(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "工单已处理",
    ),
);
/** GET /reports：分页查询用户举报；需要 report:read。 */ router.get(
  "/reports",
  permit("report:read"),
  validate(safetyListSchema, "query"),
  async (_req, res) =>
    ok(
      res,
      await safetyService.listReports(
        res.locals.validatedQuery as SafetyListQuery,
      ),
    ),
);
/** PUT /reports/:id：判定举报及记录处置；需要 report:update。 */ router.put(
  "/reports/:id",
  permit("report:update"),
  validate(safetyIdSchema, "params"),
  validate(reportHandleSchema),
  async (req, res) =>
    ok(
      res,
      await safetyService.handleReport(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "举报已处理",
    ),
);
/** GET /risk-events：分页查询规则命中的风险事件；需要 risk:read。 */ router.get(
  "/risk-events",
  permit("risk:read"),
  validate(safetyListSchema, "query"),
  async (_req, res) =>
    ok(
      res,
      await safetyService.listRisks(
        res.locals.validatedQuery as SafetyListQuery,
      ),
    ),
);
/** GET /device-risk-assessments：分页查询设备环境评分、命中项和自动封号结果。 */
router.get("/device-risk-assessments", permit("risk:read"), validate(safetyListSchema, "query"), async (_req, res) =>
  ok(res, await safetyService.listDeviceRiskAssessments(res.locals.validatedQuery as SafetyListQuery)),
);
/** GET /risk-dashboard：获取检测次数、自动封号、预警、待处理事件和平均分。 */
router.get("/risk-dashboard", permit("risk:read"), async (_req, res) => ok(res, await safetyService.getRiskDashboard()));
/** GET /risk-policy：读取当前设备评分、附近设备聚集和关联账号策略。 */
router.get("/risk-policy", permit("risk:read"), async (_req, res) => ok(res, await safetyService.getRiskPolicy()));
/** GET /risk-rules：读取十项检测的通过条件、扣分条件、数据来源和当前动态阈值。 */
router.get("/risk-rules", permit("risk:read"), async (_req, res) => ok(res, await safetyService.getRiskRuleCatalog()));
/** PUT /risk-policy：更新风控策略；需要二次密码并记录审计日志。 */
router.put("/risk-policy", permit("risk:update"), verifySecondaryPassword, validate(riskPolicySchema), async (req, res) =>
  ok(res, await safetyService.updateRiskPolicy(req.auth!.userId, req.body, req), "风控策略已更新"),
);
/** PUT /risk-events/:id：确认或忽略风险事件；需要 risk:update。 */ router.put(
  "/risk-events/:id",
  permit("risk:update"),
  validate(safetyIdSchema, "params"),
  validate(riskHandleSchema),
  async (req, res) =>
    ok(
      res,
      await safetyService.handleRisk(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "风险事件已处理",
    ),
);
/** PUT /users/:id/risk：设置用户观察、奖励限制、提现限制或冻结状态；需要 risk:update。 */ router.put(
  "/users/:id/risk",
  permit("risk:update"),
  verifySecondaryPassword,
  validate(userIdSchema, "params"),
  validate(userRiskSchema),
  async (req, res) =>
    ok(
      res,
      await safetyService.updateUserRisk(
        req.auth!.userId,
        BigInt(String(req.params.id)),
        req.body,
        req,
      ),
      "用户风险状态已更新",
    ),
);
/** GET /users/:id/security：查看用户登录、设备和风险事件；需要 risk:read。 */ router.get(
  "/users/:id/security",
  permit("risk:read"),
  validate(userIdSchema, "params"),
  async (req, res) =>
    ok(res, await safetyService.userSecurity(BigInt(String(req.params.id)))),
);

/** GET /reconciliation-runs：查询最近 50 次资金对账及其差异明细；需要 reconciliation:read。 */
router.get(
  "/reconciliation-runs",
  permit("reconciliation:read"),
  async (_req, res) => ok(res, await reconciliationService.listRuns()),
);

/** POST /reconciliation-runs：立即执行只读资金对账并记录结果；需要 reconciliation:run。 */
router.post(
  "/reconciliation-runs",
  permit("reconciliation:run"),
  async (_req, res) =>
    ok(res, await reconciliationService.runReconciliation(), "对账完成", 201),
);

export default router;
