import { z } from "zod";
export const feedbackSchema = z.object({ type:z.string().trim().min(2).max(30),content:z.string().trim().min(2).max(10000),contact:z.string().trim().max(100).optional(),imageUrls:z.array(z.string().max(1000)).max(9).optional() });
export const reportSchema = z.object({ type:z.string().trim().min(2).max(30),targetType:z.string().trim().min(2).max(30),targetId:z.string().trim().max(100).optional(),content:z.string().trim().min(2).max(10000),evidenceUrls:z.array(z.string().max(1000)).max(9).optional() });
export const listSchema=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20),status:z.string().optional()});
export const idSchema=z.object({id:z.coerce.bigint().positive()});
export const feedbackHandleSchema=z.object({status:z.enum(['PROCESSING','RESOLVED','CLOSED']),reply:z.string().trim().max(10000).optional(),internalNote:z.string().trim().max(10000).optional()}).refine(value=>value.status!=='RESOLVED'||Boolean(value.reply),{message:'解决工单时必须填写用户可见回复',path:['reply']});
export const reportHandleSchema=z.object({status:z.enum(['PROCESSING','VALID','INVALID','CLOSED']),disposition:z.string().trim().max(100).optional(),remark:z.string().trim().max(10000).optional()}).refine(value=>value.status==='PROCESSING'||Boolean(value.remark),{message:'完成举报判定时必须填写用户可见说明',path:['remark']});
export const riskHandleSchema=z.object({status:z.enum(['CONFIRMED','IGNORED']),remark:z.string().trim().min(2).max(500)});
export const userRiskSchema=z.object({riskStatus:z.enum(['NORMAL','WATCH','REWARD_RESTRICTED','WITHDRAWAL_RESTRICTED','FROZEN','BANNED']),riskRemark:z.string().trim().min(2).max(500)});
/** APP 环境检测统一上报格式；UNKNOWN 表示无法可靠判断，不参与自动处罚。 */
const checkResult=z.enum(['PASS','RISK','UNKNOWN']);
export const deviceRiskAssessmentSchema = z.object({
  challengeId:z.string().uuid(),deviceId: z.string().trim().min(8).max(100), simStatus:checkResult, wechatStatus:checkResult, douyinStatus:checkResult, alipayStatus:checkResult,
  emulatorStatus:checkResult, cloudDeviceStatus:checkResult, scriptStatus:checkResult, networkStatus:checkResult, ipStatus:checkResult,
  location: z.object({
    latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),
    accuracyMeters:z.number().min(0).max(100_000).optional(),capturedAt:z.number().int().positive().optional(),
    /** Android 12+ 使用 Location.isMock，旧版本使用 isFromMockProvider。 */
    isMock:z.boolean().optional(),
  }).optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});
export const riskPolicySchema=z.object({
  enabled:z.boolean(),requireFreshAssessment:z.boolean(),minKnownChecks:z.number().int().min(1).max(10),
  autoBanThreshold:z.number().int().min(10).max(100),warningThreshold:z.number().int().min(10).max(100),
  nearbyRadiusMeters:z.number().int().min(10).max(5_000),nearbyDeviceThreshold:z.number().int().min(2).max(100),
  presenceWindowMinutes:z.number().int().min(1).max(1_440),maxLocationAccuracyMeters:z.number().int().min(5).max(1_000),
  maxLocationAgeSeconds:z.number().int().min(30).max(600),locationRetentionHours:z.number().int().min(1).max(168),
  loginValidityHours:z.number().int().min(1).max(168),rewardValidityMinutes:z.number().int().min(1).max(1440),
  withdrawalValidityMinutes:z.number().int().min(1).max(1440),multiAccountDeviceThreshold:z.number().int().min(2).max(100),
  multiAccountIpThreshold:z.number().int().min(2).max(100),
}).refine(value=>value.warningThreshold>=value.autoBanThreshold,{message:'预警阈值不能低于自动封号阈值'});
export const riskAssessmentStatusSchema=z.object({context:z.enum(['login','reward','withdrawal']).default('login')});
export const createRiskChallengeSchema=z.object({context:z.enum(['login','reward','withdrawal'])});
/** 前台活跃位置心跳；不直接评分，只维护附近设备统计所需的短期位置。 */
export const devicePresenceSchema=z.object({
  deviceId:z.string().trim().min(8).max(100),
  location:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracyMeters:z.number().min(0).max(100_000),capturedAt:z.number().int().positive(),isMock:z.boolean()}),
});
export type ListQuery=z.infer<typeof listSchema>;
export type DeviceRiskAssessmentInput=z.infer<typeof deviceRiskAssessmentSchema>;
export type RiskPolicy=z.infer<typeof riskPolicySchema>;
export type RiskAssessmentContext=z.infer<typeof riskAssessmentStatusSchema>['context'];
export type DevicePresenceInput=z.infer<typeof devicePresenceSchema>;
export type FeedbackInput=z.infer<typeof feedbackSchema>;
export type FeedbackHandleInput=z.infer<typeof feedbackHandleSchema>;
export type ReportInput=z.infer<typeof reportSchema>;
export type ReportHandleInput=z.infer<typeof reportHandleSchema>;
export type RiskHandleInput=z.infer<typeof riskHandleSchema>;
export type UserRiskInput=z.infer<typeof userRiskSchema>;
