import { Router } from "express";
import { ok } from "../../lib/http.js";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/request.js";
import { createWithdrawalSchema, payoutAccountSchema, withdrawalListQuerySchema, type WithdrawalListQuery } from "./withdrawal.schema.js";
import * as withdrawalService from "./withdrawal.service.js";
import { financialLimiter } from "../../middleware/rate-limit.js";

const router = Router();
router.use(authenticate);

/** GET /config：获取提现开关、兑换比例、限额和手续费；需要登录。 */
router.get("/config", async (_req, res) => ok(res, await withdrawalService.getConfig()));
/** GET /payout-account：读取当前用户已绑定的脱敏收款账户。 */
router.get("/payout-account", async (req, res) => ok(res, await withdrawalService.getPayoutAccount(req.auth!.userId)));
/** PUT /payout-account：绑定或换绑收款账户；完整信息只以密文写入数据库。 */
router.put("/payout-account", financialLimiter, validate(payoutAccountSchema), async (req, res) =>
  ok(res, await withdrawalService.bindPayoutAccount(req.auth!.userId, req.body), "收款账户已保存"),
);
/** POST /：创建幂等提现申请并将金币转为冻结状态；需要登录。 */
router.post("/", financialLimiter, validate(createWithdrawalSchema), async (req, res) => ok(res, await withdrawalService.createWithdrawal(req.auth!.userId, req.body), "提现申请已提交", 201));
/** GET /mine：分页获取当前用户自己的提现记录；需要登录。 */
router.get("/mine", validate(withdrawalListQuerySchema, "query"), async (req, res) => ok(res, await withdrawalService.listMine(req.auth!.userId, res.locals.validatedQuery as WithdrawalListQuery)));

export default router;
