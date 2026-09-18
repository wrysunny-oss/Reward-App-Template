import { Router } from "express";
import { ok } from "../../lib/http.js";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/request.js";
import { adRewardStatusParamsSchema, bindInviteSchema, dramaUnlockAdIntentSchema, goldenWatchProgressSchema, inviteRelationsQuerySchema, latestAdRewardQuerySchema, rewardListQuerySchema, updateInviteCodeSchema, verifiedAdImpressionSchema, type AdRewardStatusParams, type GoldenWatchProgressInput, type InviteRelationsQuery, type LatestAdRewardQuery, type RewardListQuery, type VerifiedAdImpressionInput } from "./reward.schema.js";
import * as rewardService from "./reward.service.js";
import { actionLimiter } from "../../middleware/rate-limit.js";
import { requireProductModules } from "../../middleware/product-module.js";
import { contentType } from "../../generated/product.generated.js";

const router = Router();
router.use(authenticate);

/** GET /center：返回个人邀请码、邀请数量、签到状态和签到规则；需要登录。 */
router.get("/center", requireProductModules("rewards"), async (req, res) => ok(res, await rewardService.getRewardCenter(req.auth!.userId)));
/** GET /ledgers：分页读取当前用户自己的金币流水；需要登录。 */
router.get("/ledgers", requireProductModules("rewards"), validate(rewardListQuerySchema, "query"), async (req, res) => ok(res, await rewardService.listMyLedgers(req.auth!.userId, res.locals.validatedQuery as RewardListQuery)));
/** GET /ad-rewards/:transactionId/status：查询当前用户一次广告的服务端到账状态。 */
router.get("/ad-rewards/:transactionId/status", requireProductModules("advertising", "rewards"), validate(adRewardStatusParamsSchema, "params"), async (req, res) =>
  ok(res, await rewardService.getAdRewardStatus(req.auth!.userId, (req.params as unknown as AdRewardStatusParams).transactionId)),
);
if (contentType === "shortDrama") {
  router.post("/ad-rewards/drama-unlock-intent", requireProductModules("advertising", "rewards"), actionLimiter, validate(dramaUnlockAdIntentSchema), async (req, res) =>
    ok(res, rewardService.issueDramaUnlockAdIntent(req.auth!.userId, req.body)),
  );
}
/** GET /ad-rewards/latest：SDK 暂未返回交易号时，按广告开始时间补查服务端结算。 */
router.get("/ad-rewards/latest", requireProductModules("advertising", "rewards"), validate(latestAdRewardQuerySchema, "query"), async (req, res) =>
  ok(res, await rewardService.getLatestAdReward(req.auth!.userId, (res.locals.validatedQuery as LatestAdRewardQuery).after, (res.locals.validatedQuery as LatestAdRewardQuery).format)),
);
/** POST /ad-rewards/verified-impression：验真非激励广告 eCPM 后按后台比例发币。 */
router.post("/ad-rewards/verified-impression", requireProductModules("advertising", "rewards"), actionLimiter, validate(verifiedAdImpressionSchema), async (req, res) =>
  ok(res, await rewardService.settleVerifiedAdImpression(req.auth!.userId, req.body as VerifiedAdImpressionInput, req), "广告收益已结算", 201),
);
/** POST /invite/bind：首次绑定邀请人并事务化发放邀请奖励；需要登录。 */
router.post("/invite/bind", requireProductModules("invitations"), actionLimiter, validate(bindInviteSchema), async (req, res) => ok(res, await rewardService.bindInvite(req.auth!.userId, req.body.inviteCode), "邀请关系绑定成功", 201));
/** GET /invite/relations：查看当前用户的直属上级和直属下级；手机号仅返回脱敏结果。 */
router.get("/invite/relations", requireProductModules("invitations"), validate(inviteRelationsQuerySchema, "query"), async (req, res) =>
  ok(res, await rewardService.getMyInviteRelations(req.auth!.userId, res.locals.validatedQuery as InviteRelationsQuery)),
);
/** PUT /invite-code：修改当前用户自己的邀请码；自动转为大写且全局唯一。 */
router.put("/invite-code", requireProductModules("invitations"), actionLimiter, validate(updateInviteCodeSchema), async (req, res) =>
  ok(res, await rewardService.updateInviteCode(req.auth!.userId, req.body.inviteCode), "邀请码修改成功"),
);
/** POST /check-ins：按北京时间完成当日签到并发放连续签到奖励；需要登录。 */
router.post("/check-ins", requireProductModules("rewards"), actionLimiter, async (req, res) => ok(res, await rewardService.checkIn(req.auth!.userId), "签到成功", 201));

/** 接收原生播放器的前台观看心跳并在达标时幂等结算。 */
if (contentType === "shortDrama") {
  router.post("/golden-watch/progress", requireProductModules("rewards"), validate(goldenWatchProgressSchema), async (req, res) =>
    ok(res, await rewardService.recordGoldenWatchProgress(req.auth!.userId, req.body as GoldenWatchProgressInput, req)),
  );
}

export default router;
