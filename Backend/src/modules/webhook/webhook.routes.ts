import { Router } from "express";
import { ok } from "../../lib/http.js";
import { validate } from "../../middleware/request.js";
import { groMoreRewardQuerySchema, pangleAdRevenueSchema } from "./webhook.schema.js";
import { receiveGroMoreReward, receivePangleAdRevenue, verifyPangleSignature } from "./webhook.service.js";

const router = Router();

/** POST /pangle/ad-revenue：接收广告收入事件；需携带时间戳、随机串和 HMAC-SHA256 签名。 */
router.post("/pangle/ad-revenue", validate(pangleAdRevenueSchema), async (req, res) => {
  verifyPangleSignature(req);
  return ok(res, await receivePangleAdRevenue(req.body, req), "广告回调处理成功");
});

/** GET /pangle/reward：GroMore 广告位维度服务端激励验证，响应格式必须保持平台约定。 */
router.get("/pangle/reward", async (req, res) => {
  const parsed = groMoreRewardQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.json({ is_verify: false, reason: 40001 });
  return res.json(await receiveGroMoreReward(parsed.data, req));
});

export default router;
