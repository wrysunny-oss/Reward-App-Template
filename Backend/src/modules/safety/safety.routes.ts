import { Router } from "express";
import { ok } from "../../lib/http.js";
import { authenticate } from "../../middleware/auth.js";
import { actionLimiter } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/request.js";
import { createRiskChallengeSchema, devicePresenceSchema, deviceRiskAssessmentSchema, feedbackSchema, reportSchema, riskAssessmentStatusSchema } from "./safety.schema.js";
import * as service from "./safety.service.js";

const router = Router();
router.use(authenticate);

/** POST /feedback：提交问题、联系方式和图片证据；需要登录。 */
router.post("/feedback", actionLimiter, validate(feedbackSchema), async (req, res) => ok(res, await service.createFeedback(req.auth!.userId, req.body), "反馈已提交", 201));
/** GET /feedback/mine：查看当前用户反馈状态和官方回复；需要登录。 */
router.get("/feedback/mine", async (req, res) => ok(res, await service.myFeedback(req.auth!.userId)));
/** POST /reports：提交内容、广告或用户行为举报；需要登录。 */
router.post("/reports", actionLimiter, validate(reportSchema), async (req, res) => ok(res, await service.createReport(req.auth!.userId, req.body), "举报已提交", 201));
/** GET /reports/mine：查看当前用户提交的举报与平台处理进度。 */
router.get("/reports/mine", async (req, res) => ok(res, await service.myReports(req.auth!.userId)));
/** POST /device-risk-assessments：服务端按十项环境检测评分，位置项统计配置半径和时间窗口内的活跃唯一设备。 */
router.post("/device-risk-assessments", actionLimiter, validate(deviceRiskAssessmentSchema), async (req, res) => ok(res, await service.assessDeviceRisk(req.auth!.userId, req.body, req), "设备风险检测完成", 201));
/** GET /device-risk-status：查询登录、广告或提现场景下最近检测是否仍然有效。 */
router.get("/device-risk-status", validate(riskAssessmentStatusSchema, "query"), async (req, res) => ok(res, await service.getRiskAssessmentStatus(req.auth!.userId, res.locals.validatedQuery.context)));
/** POST /device-risk-challenges：签发两分钟有效的一次性随机挑战，用于绑定本次原生检测。 */
router.post("/device-risk-challenges", actionLimiter, validate(createRiskChallengeSchema), async (req, res) => ok(res, await service.createRiskChallenge(req.auth!.userId, req.body.context), "设备检测挑战已签发", 201));
/** POST /device-presence：APP 前台每五分钟上报一次，只维护附近设备统计的短期活跃位置。 */
router.post("/device-presence", actionLimiter, validate(devicePresenceSchema), async (req, res) => ok(res, await service.recordDevicePresence(req.auth!.userId, req.body), "设备活跃位置已更新"));

export default router;
