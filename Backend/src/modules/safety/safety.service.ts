import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { env } from '../../config.js';
import { AppError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { createUserNotification } from '../notification/notification.service.js';
import type { DevicePresenceInput, DeviceRiskAssessmentInput, FeedbackHandleInput, FeedbackInput, ListQuery, ReportHandleInput, ReportInput, RiskAssessmentContext, RiskHandleInput, RiskPolicy, UserRiskInput } from './safety.schema.js';
type AuditRequest=Pick<Request,'method'|'path'|'ip'|'header'>;
export async function assertAllowed(userId:bigint,scope:'reward'|'withdrawal'){const user=await prisma.user.findUniqueOrThrow({where:{id:userId},select:{riskStatus:true}});const blocked=['FROZEN','BANNED',scope==='reward'?'REWARD_RESTRICTED':'WITHDRAWAL_RESTRICTED'];if(blocked.includes(user.riskStatus))throw new AppError(403,3401,`当前账号已被限制${scope==='reward'?'领取奖励':'提现'}`);}
export const createFeedback=(userId:bigint,data:FeedbackInput)=>prisma.feedback.create({data:{...data,userId,imageUrls:data.imageUrls}});
export const createReport=(userId:bigint,data:ReportInput)=>prisma.report.create({data:{...data,userId,evidenceUrls:data.evidenceUrls}});

type PublicHistory = { createdAt: Date; status: string };
async function publicHistory(targetType:'feedback'|'report',targetIds:string[]) {
  if (!targetIds.length) return new Map<string, PublicHistory[]>();
  const logs=await prisma.auditLog.findMany({where:{targetType,targetId:{in:targetIds}},select:{targetId:true,createdAt:true,detail:true},orderBy:{createdAt:'asc'}});
  const grouped=new Map<string,PublicHistory[]>();
  for(const log of logs){
    const detail=log.detail && typeof log.detail==='object' && !Array.isArray(log.detail) ? log.detail as Record<string,unknown> : {};
    if(typeof detail.status!=='string'||!log.targetId)continue;
    grouped.set(log.targetId,[...(grouped.get(log.targetId)??[]),{createdAt:log.createdAt,status:detail.status}]);
  }
  return grouped;
}

export async function myFeedback(userId:bigint){
  const list=await prisma.feedback.findMany({where:{userId},select:{id:true,type:true,content:true,contact:true,imageUrls:true,status:true,reply:true,resolvedAt:true,createdAt:true,updatedAt:true},orderBy:{id:'desc'}});
  const history=await publicHistory('feedback',list.map(item=>item.id.toString()));
  return list.map(item=>({...item,history:[{status:'PENDING',createdAt:item.createdAt},...(history.get(item.id.toString())??[])]}));
}
export async function myReports(userId:bigint){
  const list=await prisma.report.findMany({where:{userId},select:{id:true,type:true,targetType:true,targetId:true,content:true,evidenceUrls:true,status:true,disposition:true,remark:true,resolvedAt:true,createdAt:true,updatedAt:true},orderBy:{id:'desc'}});
  const history=await publicHistory('report',list.map(item=>item.id.toString()));
  return list.map(item=>({...item,history:[{status:'PENDING',createdAt:item.createdAt},...(history.get(item.id.toString())??[])]}));
}
export async function listFeedback(q:ListQuery){const where=q.status?{status:q.status as any}:{};const [list,total]=await prisma.$transaction([prisma.feedback.findMany({where,include:{user:{select:{phone:true,nickname:true}}},skip:(q.page-1)*q.pageSize,take:q.pageSize,orderBy:{id:'desc'}}),prisma.feedback.count({where})]);const history=await publicHistory('feedback',list.map(item=>item.id.toString()));return{list:list.map(item=>({...item,history:[{status:'PENDING',createdAt:item.createdAt},...(history.get(item.id.toString())??[])]})),total,...q};}
export async function handleFeedback(operatorId:bigint,id:bigint,data:FeedbackHandleInput,req:AuditRequest){return prisma.$transaction(async tx=>{const current=await tx.feedback.findUnique({where:{id},select:{userId:true,status:true,reply:true}});if(!current)throw new AppError(404,3501,'反馈工单不存在');const resolved=['RESOLVED','CLOSED'].includes(data.status);const item=await tx.feedback.update({where:{id},data:{...data,handlerId:operatorId,resolvedAt:resolved?new Date():null}});await tx.auditLog.create({data:{operatorId,action:'feedback.handle',method:req.method,path:req.path,targetType:'feedback',targetId:id.toString(),ip:req.ip,userAgent:req.header('user-agent'),detail:{status:data.status,previousStatus:current.status,hasReply:Boolean(data.reply),internalNote:data.internalNote}}});const publicChanged=current.status!==data.status||(data.reply??null)!==current.reply;if(current.userId&&publicChanged)await createUserNotification(tx,current.userId,{type:'SYSTEM',title:'反馈处理进度更新',content:data.reply?.trim()||`您的反馈状态已更新为${data.status==='PROCESSING'?'处理中':data.status==='RESOLVED'?'已解决':'已关闭'}。`});return item;});}
export async function listReports(q:ListQuery){const where=q.status?{status:q.status as any}:{};const [list,total]=await prisma.$transaction([prisma.report.findMany({where,include:{user:{select:{phone:true,nickname:true}}},skip:(q.page-1)*q.pageSize,take:q.pageSize,orderBy:{id:'desc'}}),prisma.report.count({where})]);const history=await publicHistory('report',list.map(item=>item.id.toString()));return{list:list.map(item=>({...item,history:[{status:'PENDING',createdAt:item.createdAt},...(history.get(item.id.toString())??[])]})),total,...q};}
export async function handleReport(operatorId:bigint,id:bigint,data:ReportHandleInput,req:AuditRequest){return prisma.$transaction(async tx=>{const current=await tx.report.findUnique({where:{id},select:{userId:true,status:true,remark:true,disposition:true}});if(!current)throw new AppError(404,3502,'举报记录不存在');const resolved=['VALID','INVALID','CLOSED'].includes(data.status);const item=await tx.report.update({where:{id},data:{...data,handlerId:operatorId,resolvedAt:resolved?new Date():null}});await tx.auditLog.create({data:{operatorId,action:'report.handle',method:req.method,path:req.path,targetType:'report',targetId:id.toString(),ip:req.ip,userAgent:req.header('user-agent'),detail:{status:data.status,previousStatus:current.status,disposition:data.disposition,remark:data.remark}}});const publicChanged=current.status!==data.status||(data.remark??null)!==current.remark||(data.disposition??null)!==current.disposition;if(publicChanged)await createUserNotification(tx,current.userId,{type:'SYSTEM',title:'举报处理进度更新',content:data.remark?.trim()||`您的举报状态已更新为${data.status==='PROCESSING'?'处理中':data.status==='VALID'?'有效':data.status==='INVALID'?'无效':'已关闭'}。`});return item;});}
export async function listRisks(q:ListQuery){const where=q.status?{status:q.status as any}:{};const [list,total]=await prisma.$transaction([prisma.riskEvent.findMany({where,include:{user:{select:{id:true,phone:true,nickname:true,riskStatus:true}}},skip:(q.page-1)*q.pageSize,take:q.pageSize,orderBy:{id:'desc'}}),prisma.riskEvent.count({where})]);return{list,total,...q};}
export async function handleRisk(operatorId:bigint,id:bigint,data:RiskHandleInput,req:AuditRequest){return prisma.$transaction(async tx=>{const current=await tx.riskEvent.findUnique({where:{id},select:{status:true}});if(!current)throw new AppError(404,3503,'风险事件不存在');const item=await tx.riskEvent.update({where:{id},data:{...data,handlerId:operatorId,handledAt:new Date()}});await tx.auditLog.create({data:{operatorId,action:'risk-event.handle',method:req.method,path:req.path,targetType:'risk-event',targetId:id.toString(),ip:req.ip,userAgent:req.header('user-agent'),detail:{status:data.status,previousStatus:current.status,remark:data.remark}}});return item;});}
export async function updateUserRisk(operatorId:bigint,userId:bigint,data:UserRiskInput,req:AuditRequest){return prisma.$transaction(async tx=>{const status=data.riskStatus==='BANNED'?'DISABLED':data.riskStatus==='NORMAL'?'ACTIVE':undefined;const user=await tx.user.update({where:{id:userId},data:{...data,...(status?{status}: {})}});if(['BANNED','FROZEN'].includes(data.riskStatus))await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{operatorId,action:'user.risk.update',method:req.method,path:req.path,targetType:'user',targetId:userId.toString(),ip:req.ip,userAgent:req.header('user-agent'),detail:{...data,status}}});return user;});}
export const userSecurity=(userId:bigint)=>Promise.all([prisma.loginLog.findMany({where:{userId},take:50,orderBy:{id:'desc'}}),prisma.userDevice.findMany({where:{userId},orderBy:{lastSeenAt:'desc'}}),prisma.riskEvent.findMany({where:{userId},take:50,orderBy:{id:'desc'}}),prisma.deviceRiskAssessment.findMany({where:{userId},take:50,orderBy:{createdAt:'desc'}})]).then(([loginLogs,devices,riskEvents,riskAssessments])=>({loginLogs,devices,riskEvents,riskAssessments}));

const toRadians = (degrees:number) => degrees * Math.PI / 180;
/** 使用 Haversine 公式由服务端计算两坐标距离，不直接信任客户端提交的距离。 */
export function distanceInMeters(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}) {
  const earthRadius=6_371_000; const dLat=toRadians(b.latitude-a.latitude); const dLon=toRadians(b.longitude-a.longitude);
  const value=Math.sin(dLat/2)**2+Math.cos(toRadians(a.latitude))*Math.cos(toRadians(b.latitude))*Math.sin(dLon/2)**2;
  return Math.round(earthRadius*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value)));
}

/** SIM、三款常用应用、模拟器、云机、脚本、网络、IP 和位置各占 10 分。 */
export const DEFAULT_RISK_POLICY:RiskPolicy={enabled:true,requireFreshAssessment:false,minKnownChecks:6,autoBanThreshold:60,warningThreshold:80,nearbyRadiusMeters:150,nearbyDeviceThreshold:5,presenceWindowMinutes:10,maxLocationAccuracyMeters:50,maxLocationAgeSeconds:120,locationRetentionHours:24,loginValidityHours:24,rewardValidityMinutes:360,withdrawalValidityMinutes:10,multiAccountDeviceThreshold:3,multiAccountIpThreshold:10};

export type RiskCheckStatus = 'PASS' | 'RISK' | 'UNKNOWN';
export type RiskCheckCode = 'alipay' | 'cloudDevice' | 'douyin' | 'emulator' | 'ip' | 'location' | 'network' | 'script' | 'sim' | 'wechat';

/**
 * 十项设备环境规则的唯一说明源。
 * 后台规则页和单次检测明细都由这里生成，避免前端文案与服务端实际评分逻辑不一致。
 */
const RISK_RULE_DEFINITIONS: Array<{
  code: RiskCheckCode;
  name: string;
  passCondition: string;
  riskCondition: string;
  source: string;
}> = [
  { code: 'sim', name: 'SIM 卡检测', passCondition: '设备存在且 SIM 状态为就绪', riskCondition: '已授权读取电话状态，但未检测到可用 SIM 卡', source: 'Android TelephonyManager' },
  { code: 'wechat', name: '微信安装检测', passCondition: '系统可查询到微信安装包', riskCondition: '未检测到微信安装包', source: 'Android PackageManager' },
  { code: 'douyin', name: '抖音安装检测', passCondition: '系统可查询到抖音安装包', riskCondition: '未检测到抖音安装包', source: 'Android PackageManager' },
  { code: 'alipay', name: '支付宝安装检测', passCondition: '系统可查询到支付宝安装包', riskCondition: '未检测到支付宝安装包', source: 'Android PackageManager' },
  { code: 'emulator', name: '模拟器检测', passCondition: '未命中模拟器硬件或系统特征', riskCondition: '命中 QEMU、goldfish、ranchu、generic 等模拟器特征', source: 'Android Build 与硬件特征' },
  { code: 'cloudDevice', name: '云手机 / 云机检测', passCondition: '未命中云手机或虚拟容器特征', riskCondition: '命中云手机厂商、VMOS、沙箱等环境特征', source: 'Android Build 与设备特征' },
  { code: 'script', name: '脚本 / Hook 环境检测', passCondition: '未发现调试器、Root、Magisk、Frida 或 Xposed', riskCondition: '发现调试器、Root 文件、Hook 管理器或可疑进程库', source: '原生进程与文件环境' },
  { code: 'network', name: '网络环境检测', passCondition: '当前网络已验证且未发现 VPN 或系统代理', riskCondition: '检测到 VPN、系统代理或异常网络环境', source: 'Android ConnectivityManager' },
  { code: 'ip', name: 'IP 关联检测', passCondition: '服务端取得公网 IP，且关联账号数低于阈值', riskCondition: '同一公网 IP 关联账号数达到策略阈值', source: '服务端连接 IP 与历史账号关联' },
  { code: 'location', name: '附近设备聚集检测', passCondition: '指定半径及时间窗口内的活跃唯一设备数低于阈值', riskCondition: '指定半径及时间窗口内的活跃唯一设备数达到阈值，或定位被系统标记为模拟位置', source: 'APP 前台定位 + 服务端活跃设备聚合' },
];

export function getRiskRuleDefinitions(policy: RiskPolicy = DEFAULT_RISK_POLICY) {
  return RISK_RULE_DEFINITIONS.map((rule) => ({
    ...rule,
    deduction: 10,
    unknownHandling: '无法可靠判断时不扣分，也不计入有效检测项',
    ...(rule.code === 'ip' ? { riskCondition: `同一公网 IP 关联账号数达到 ${policy.multiAccountIpThreshold} 个` } : {}),
    ...(rule.code === 'location' ? { passCondition: `最近 ${policy.presenceWindowMinutes} 分钟内，${policy.nearbyRadiusMeters} 米范围的活跃唯一设备少于 ${policy.nearbyDeviceThreshold} 台`, riskCondition: `最近 ${policy.presenceWindowMinutes} 分钟内，${policy.nearbyRadiusMeters} 米范围的活跃唯一设备达到 ${policy.nearbyDeviceThreshold} 台，或检测到模拟定位` } : {}),
  }));
}

type AssessmentForExplanation = {
  alipayInstalled: boolean | null;
  cloudDeviceDetected: boolean | null;
  detail: unknown;
  distanceMeters: number | null;
  douyinInstalled: boolean | null;
  emulatorDetected: boolean | null;
  ip: string | null;
  ipTrusted: boolean | null;
  locationDistanceSafe: boolean | null;
  locationClusterSafe?: boolean | null;
  locationAccuracyMeters?: number | null;
  locationMock?: boolean | null;
  nearbyDeviceCount?: number | null;
  nearbyRadiusMeters?: number | null;
  presenceWindowMinutes?: number | null;
  networkTrusted: boolean | null;
  scriptDetected: boolean | null;
  simPresent: boolean | null;
  wechatInstalled: boolean | null;
};

const objectValue = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const statusFromSafe = (value: boolean | null): RiskCheckStatus => value == null ? 'UNKNOWN' : value ? 'PASS' : 'RISK';
const statusFromDetected = (value: boolean | null): RiskCheckStatus => value == null ? 'UNKNOWN' : value ? 'RISK' : 'PASS';

/**
 * 为单次检测生成可审计的逐项解释。旧记录没有策略快照时使用当前策略，并通过 policySource 明确标识。
 */
export function explainRiskAssessment(assessment: AssessmentForExplanation, currentPolicy: RiskPolicy = DEFAULT_RISK_POLICY) {
  const detail = objectValue(assessment.detail);
  const savedPolicy = objectValue(detail.policySnapshot);
  const policy = Object.keys(savedPolicy).length > 0
    ? { ...currentPolicy, ...savedPolicy } as RiskPolicy
    : currentPolicy;
  let evidence: Record<string, unknown> = {};
  if (typeof detail.evidenceJson === 'string') {
    try { evidence = objectValue(JSON.parse(detail.evidenceJson)); } catch { evidence = {}; }
  } else {
    evidence = objectValue(detail.evidence);
  }
  const checks: Record<RiskCheckCode, RiskCheckStatus> = {
    sim: statusFromSafe(assessment.simPresent),
    wechat: statusFromSafe(assessment.wechatInstalled),
    douyin: statusFromSafe(assessment.douyinInstalled),
    alipay: statusFromSafe(assessment.alipayInstalled),
    emulator: statusFromDetected(assessment.emulatorDetected),
    cloudDevice: statusFromDetected(assessment.cloudDeviceDetected),
    script: statusFromDetected(assessment.scriptDetected),
    network: statusFromSafe(assessment.networkTrusted),
    ip: statusFromSafe(assessment.ipTrusted),
    location: statusFromSafe(assessment.locationClusterSafe ?? assessment.locationDistanceSafe),
  };
  const reason = (code: RiskCheckCode, status: RiskCheckStatus) => {
    // 旧数据保留原“中心点距离”结果，仅做明确标识，不能伪装成附近设备聚集判断。
    if(code==='location'&&assessment.locationClusterSafe==null&&assessment.locationDistanceSafe!=null){
      return `旧版地址中心距离检测结果：服务端计算距离 ${assessment.distanceMeters ?? '未知'} 米；该记录早于附近设备聚集规则`;
    }
    if (status === 'UNKNOWN') {
      if (code === 'sim' && evidence.phonePermission === false) return '未授予电话状态权限，无法确认 SIM 状态；本项不扣分';
      if (code === 'location') return `未取得可靠定位：可能未授权、位置超过 ${policy.maxLocationAgeSeconds} 秒或精度差于 ${policy.maxLocationAccuracyMeters} 米；本项不扣分`;
      if (code === 'ip') return '服务端仅取得本地或内网 IP，无法执行公网 IP 关联判断；本项不扣分';
      return '采集器未返回可靠结果；本项不扣分，也不计入有效检测项';
    }
    if (status === 'PASS') {
      if (code === 'ip') return `${assessment.ip ?? '当前 IP'} 的关联账号数未达到 ${policy.multiAccountIpThreshold} 个`;
      if (code === 'location') return `最近 ${assessment.presenceWindowMinutes ?? policy.presenceWindowMinutes} 分钟内，${assessment.nearbyRadiusMeters ?? policy.nearbyRadiusMeters} 米范围检测到 ${assessment.nearbyDeviceCount ?? 1} 台活跃唯一设备，低于 ${policy.nearbyDeviceThreshold} 台`;
      return getRiskRuleDefinitions(policy).find((item) => item.code === code)!.passCondition;
    }
    if (code === 'ip') return `${assessment.ip ?? '当前 IP'} 的关联账号数达到 ${policy.multiAccountIpThreshold} 个或以上`;
    if (code === 'location') return assessment.locationMock
      ? 'Android 系统将本次位置标记为模拟定位，本项扣 10 分'
      : `最近 ${assessment.presenceWindowMinutes ?? policy.presenceWindowMinutes} 分钟内，${assessment.nearbyRadiusMeters ?? policy.nearbyRadiusMeters} 米范围检测到 ${assessment.nearbyDeviceCount ?? policy.nearbyDeviceThreshold} 台活跃唯一设备，达到 ${policy.nearbyDeviceThreshold} 台阈值`;
    return getRiskRuleDefinitions(policy).find((item) => item.code === code)!.riskCondition;
  };
  const deviceSummary = [evidence.manufacturer, evidence.model, evidence.product, evidence.hardware]
    .filter((value) => typeof value === 'string' && value.length > 0).join(' / ');
  return {
    context: typeof detail.context === 'string' ? detail.context : null,
    enforcementSuppressed: detail.enforcementSuppressed === true,
    policySource: Object.keys(savedPolicy).length > 0 ? 'SNAPSHOT' as const : 'CURRENT' as const,
    policy,
    evidence: {
      collectorVersion: evidence.collectorVersion ?? null,
      platform: evidence.platform ?? null,
      sdkInt: evidence.sdkInt ?? null,
      device: deviceSummary || null,
      supportedAbis: evidence.supportedAbis ?? null,
      debuggable: evidence.debuggable ?? null,
      phonePermission: evidence.phonePermission ?? null,
      locationPermission: evidence.locationPermission ?? null,
      locationProvider: evidence.locationProvider ?? null,
      locationAccuracyMeters: assessment.locationAccuracyMeters ?? null,
      locationMock: assessment.locationMock ?? null,
      nearbyDeviceCount: assessment.nearbyDeviceCount ?? null,
      nearbyRadiusMeters: assessment.nearbyRadiusMeters ?? null,
      presenceWindowMinutes: assessment.presenceWindowMinutes ?? null,
      deviceAccountCount: detail.deviceAccountCount ?? null,
      ipAccountCount: detail.ipAccountCount ?? null,
    },
    breakdown: getRiskRuleDefinitions(policy).map((rule) => ({
      ...rule,
      status: checks[rule.code],
      deduction: checks[rule.code] === 'RISK' ? rule.deduction : 0,
      reason: reason(rule.code, checks[rule.code]),
    })),
  };
}
export function calculateDeviceRiskScore(input:DeviceRiskAssessmentInput,policy:RiskPolicy=DEFAULT_RISK_POLICY,locationStatus:RiskCheckStatus='UNKNOWN') {
  const checks={sim:input.simStatus,wechat:input.wechatStatus,douyin:input.douyinStatus,alipay:input.alipayStatus,emulator:input.emulatorStatus,cloudDevice:input.cloudDeviceStatus,script:input.scriptStatus,network:input.networkStatus,ip:input.ipStatus,location:locationStatus} as const;
  const values=Object.values(checks);const knownChecks=values.filter(value=>value!=='UNKNOWN').length;const riskChecks=values.filter(value=>value==='RISK').length;
  return {score:100-riskChecks*10,knownChecks,eligibleForDecision:knownChecks>=policy.minKnownChecks,checks};
}

/** 本地、回环 IP 在开发环境没有公网信誉意义；公网 IP 的关联账号数由服务端判断。 */
function normalizedIp(value:string|undefined) {
  const ip=(value??'').replace(/^::ffff:/,'');
  if(!ip||ip==='::1'||ip==='127.0.0.1'||ip.startsWith('10.')||ip.startsWith('192.168.')||/^172\.(1[6-9]|2\d|3[01])\./.test(ip))return null;
  return ip;
}

/** 快照入库；生产环境低于策略阈值时封号，开发环境只记录以免模拟器锁死测试账号。 */
export async function assessDeviceRisk(userId:bigint,input:DeviceRiskAssessmentInput,req:AuditRequest) {
  const policy=await getRiskPolicy();
  return prisma.$transaction(async tx=>{
    const challenge=await tx.deviceRiskChallenge.findFirst({
      where:{id:input.challengeId,userId,usedAt:null,expiresAt:{gt:new Date()}},
    });
    if(!challenge)throw new AppError(409,3403,'设备检测挑战不存在、已过期或已使用');
    if(input.evidence?.challengeNonce!==challenge.nonce)throw new AppError(409,3404,'设备检测挑战校验失败');
    await tx.deviceRiskChallenge.update({where:{id:challenge.id},data:{usedAt:new Date()}});

    const publicIp=normalizedIp(req.ip);
    const [deviceUsers,ipUsers]=await Promise.all([
      tx.deviceRiskAssessment.findMany({where:{deviceId:input.deviceId},distinct:['userId'],select:{userId:true}}),
      publicIp?tx.deviceRiskAssessment.findMany({where:{ip:publicIp},distinct:['userId'],select:{userId:true}}):Promise.resolve([]),
    ]);
    const deviceAccountCount=new Set([...deviceUsers.map(item=>item.userId.toString()),userId.toString()]).size;
    const ipAccountCount=publicIp?new Set([...ipUsers.map(item=>item.userId.toString()),userId.toString()]).size:0;
    // 客户端上报的 ipStatus 不可信，以服务端连接 IP 和历史关联账号数覆盖。
    const serverIpStatus:'PASS'|'RISK'|'UNKNOWN'=publicIp
      ?(ipAccountCount>=policy.multiAccountIpThreshold?'RISK':'PASS')
      :'UNKNOWN';
    const now=new Date();
    const activeSince=new Date(now.getTime()-policy.presenceWindowMinutes*60_000);
    const retentionCutoff=new Date(now.getTime()-policy.locationRetentionHours*3_600_000);
    await tx.deviceLocationPresence.deleteMany({where:{lastSeenAt:{lt:retentionCutoff}}});

    let locationStatus:RiskCheckStatus='UNKNOWN';
    let nearbyDeviceCount:number|null=null;
    let nearbyDevices:Array<{deviceId:string;distanceMeters:number;userId:bigint}>=[];
    const location=input.location;
    const locationAgeMs=location?.capturedAt==null?null:now.getTime()-location.capturedAt;
    const accurate=location?.accuracyMeters!=null&&location.accuracyMeters<=policy.maxLocationAccuracyMeters;
    const fresh=locationAgeMs!=null&&locationAgeMs>=-30_000&&locationAgeMs<=policy.maxLocationAgeSeconds*1_000;
    if(location?.isMock===true){
      locationStatus='RISK';
    }else if(location?.isMock===false&&accurate&&fresh){
      // 同一安装设备始终只保留一条最新位置；切换账号不会被重复计算成多台设备。
      await tx.deviceLocationPresence.upsert({
        where:{deviceId:input.deviceId},
        create:{userId,deviceId:input.deviceId,latitude:location.latitude,longitude:location.longitude,accuracyMeters:location.accuracyMeters!,lastSeenAt:now},
        update:{userId,latitude:location.latitude,longitude:location.longitude,accuracyMeters:location.accuracyMeters!,lastSeenAt:now},
      });
      // 先按经纬度包围盒缩小候选集，再由服务端 Haversine 精确计算 150 米距离。
      const latitudeDelta=policy.nearbyRadiusMeters/111_320;
      const longitudeScale=Math.max(Math.cos(toRadians(location.latitude)),0.01);
      const longitudeDelta=policy.nearbyRadiusMeters/(111_320*longitudeScale);
      const candidates=await tx.deviceLocationPresence.findMany({
        where:{lastSeenAt:{gte:activeSince},latitude:{gte:location.latitude-latitudeDelta,lte:location.latitude+latitudeDelta},longitude:{gte:location.longitude-longitudeDelta,lte:location.longitude+longitudeDelta}},
        select:{deviceId:true,userId:true,latitude:true,longitude:true},
      });
      nearbyDevices=candidates.map(item=>({...item,distanceMeters:distanceInMeters(location,item)})).filter(item=>item.distanceMeters<=policy.nearbyRadiusMeters);
      nearbyDeviceCount=nearbyDevices.length;
      locationStatus=nearbyDeviceCount>=policy.nearbyDeviceThreshold?'RISK':'PASS';
    }
    const scoredInput={...input,ipStatus:serverIpStatus};
    const result=calculateDeviceRiskScore(scoredInput,policy,locationStatus);
    const eligibleForAutoBan=policy.enabled&&result.eligibleForDecision&&result.score<policy.autoBanThreshold;
    const autoBanned=env.NODE_ENV==='production'&&eligibleForAutoBan;
    const safe=(value:'PASS'|'RISK'|'UNKNOWN')=>value==='UNKNOWN'?null:value==='PASS';
    const detected=(value:'PASS'|'RISK'|'UNKNOWN')=>value==='UNKNOWN'?null:value==='RISK';

    const assessment=await tx.deviceRiskAssessment.create({data:{
      userId,deviceId:input.deviceId,score:result.score,knownChecks:result.knownChecks,autoBanned,
      simPresent:safe(input.simStatus),wechatInstalled:safe(input.wechatStatus),
      douyinInstalled:safe(input.douyinStatus),alipayInstalled:safe(input.alipayStatus),
      emulatorDetected:detected(input.emulatorStatus),cloudDeviceDetected:detected(input.cloudDeviceStatus),
      scriptDetected:detected(input.scriptStatus),networkTrusted:safe(input.networkStatus),
      ipTrusted:safe(serverIpStatus),locationDistanceSafe:null,locationClusterSafe:safe(result.checks.location),
      nearbyDeviceCount,nearbyRadiusMeters:policy.nearbyRadiusMeters,presenceWindowMinutes:policy.presenceWindowMinutes,
      locationAccuracyMeters:location?.accuracyMeters,locationMock:location?.isMock,ip:publicIp??req.ip,
      detail:{context:challenge.context,checks:result.checks,policySnapshot:policy,deviceAccountCount,ipAccountCount,locationAgeMs,nearbyDeviceIds:nearbyDevices.map(item=>item.deviceId.slice(0,12)),enforcementSuppressed:env.NODE_ENV!=='production'&&eligibleForAutoBan,evidenceJson:JSON.stringify(input.evidence??{})},
    }});

    if(autoBanned){
      await tx.user.update({where:{id:userId},data:{riskStatus:'BANNED',status:'DISABLED',riskRemark:`设备环境评分 ${result.score} 分，低于 ${policy.autoBanThreshold} 分自动封号`}});
      await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.riskEvent.create({data:{userId,ruleCode:'DEVICE_ENV_SCORE_LOW',level:'CRITICAL',title:'设备环境评分过低，已自动封号',detail:{assessmentId:assessment.id,score:result.score,checks:result.checks,nearbyDeviceCount,ip:publicIp}}});
    } else if(policy.enabled&&result.eligibleForDecision&&result.score<policy.warningThreshold){
      await tx.riskEvent.create({data:{userId,ruleCode:'DEVICE_ENV_SCORE_WARNING',level:'MEDIUM',title:eligibleForAutoBan?'设备评分过低（开发环境未执行封号）':'设备环境评分偏低',detail:{assessmentId:assessment.id,score:result.score,checks:result.checks}}});
    }
    if(!result.eligibleForDecision)await tx.riskEvent.create({data:{userId,ruleCode:'DEVICE_ENV_EVIDENCE_INSUFFICIENT',level:'MEDIUM',title:'设备检测有效项目不足',detail:{assessmentId:assessment.id,knownChecks:result.knownChecks,required:policy.minKnownChecks,checks:result.checks}}});
    if(deviceAccountCount>=policy.multiAccountDeviceThreshold)await tx.riskEvent.create({data:{userId,ruleCode:'DEVICE_MULTI_ACCOUNT',level:'HIGH',title:'同一设备关联多个账号',detail:{assessmentId:assessment.id,deviceId:input.deviceId,accountCount:deviceAccountCount}}});
    if(publicIp&&ipAccountCount>=policy.multiAccountIpThreshold)await tx.riskEvent.create({data:{userId,ruleCode:'IP_MULTI_ACCOUNT',level:'HIGH',title:'同一 IP 关联账号过多',detail:{assessmentId:assessment.id,ip:publicIp,accountCount:ipAccountCount}}});
    if(locationStatus==='RISK'){
      const clusterUserIds=location?.isMock===true?[userId]:[...new Set(nearbyDevices.map(item=>item.userId.toString()))].map(value=>BigInt(value));
      const existing=await tx.riskEvent.findMany({where:{userId:{in:clusterUserIds},ruleCode:'LOCATION_DEVICE_CLUSTER',createdAt:{gte:activeSince}},select:{userId:true}});
      const existingIds=new Set(existing.flatMap(item=>item.userId?[item.userId.toString()]:[]));
      const targets=clusterUserIds.filter(id=>!existingIds.has(id.toString()));
      if(targets.length)await tx.riskEvent.createMany({data:targets.map(targetUserId=>({userId:targetUserId,ruleCode:'LOCATION_DEVICE_CLUSTER',level:'HIGH',title:location?.isMock===true?'检测到模拟定位':'附近设备聚集数量达到阈值',detail:{assessmentId:assessment.id,nearbyDeviceCount,radiusMeters:policy.nearbyRadiusMeters,windowMinutes:policy.presenceWindowMinutes,threshold:policy.nearbyDeviceThreshold,locationMock:location?.isMock===true}}))});
    }
    return {id:assessment.id,score:result.score,knownChecks:result.knownChecks,eligibleForDecision:result.eligibleForDecision,autoBanned,checks:result.checks,nearbyDeviceCount,nearbyRadiusMeters:policy.nearbyRadiusMeters,presenceWindowMinutes:policy.presenceWindowMinutes,deviceAccountCount,ipAccountCount};
  });
}

/** 后台分页查看设备环境评分历史及当前账号状态。 */
export async function listDeviceRiskAssessments(q:ListQuery){
  const policy=await getRiskPolicy();
  const [list,total]=await prisma.$transaction([prisma.deviceRiskAssessment.findMany({include:{user:{select:{id:true,phone:true,nickname:true,riskStatus:true,status:true}}},skip:(q.page-1)*q.pageSize,take:q.pageSize,orderBy:{createdAt:'desc'}}),prisma.deviceRiskAssessment.count()]);
  return{list:list.map(item=>({...item,...explainRiskAssessment(item,policy)})),total,...q};
}

export async function getRiskPolicy():Promise<RiskPolicy>{const row=await prisma.systemConfig.findUnique({where:{key:'risk.device_policy'}});if(!row||typeof row.value!=='object'||Array.isArray(row.value))return DEFAULT_RISK_POLICY;return {...DEFAULT_RISK_POLICY,...row.value as Partial<RiskPolicy>};}
/** 返回后台可读规则目录，包括实时阈值、每项扣分和未知项处理方式。 */
export async function getRiskRuleCatalog(){const policy=await getRiskPolicy();return{policy,baseScore:100,totalChecks:10,scorePerRisk:10,decision:`至少 ${policy.minKnownChecks} 项有效检测后参与自动判定；总分低于 ${policy.autoBanThreshold} 分自动封号，低于 ${policy.warningThreshold} 分进入预警`,rules:getRiskRuleDefinitions(policy)};}
export async function createRiskChallenge(userId:bigint,context:RiskAssessmentContext){
  await prisma.deviceRiskChallenge.deleteMany({where:{userId,usedAt:null,expiresAt:{lt:new Date()}}});
  const challenge=await prisma.deviceRiskChallenge.create({data:{userId,context,nonce:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+2*60_000)},select:{id:true,context:true,nonce:true,expiresAt:true}});
  return challenge;
}
/**
 * 维护“正在运行 APP”的短期位置心跳。定位质量不合格时拒绝入池，但不会处罚用户；
 * 真正的扣分仍只发生在带一次性挑战的完整设备风控检测中。
 */
export async function recordDevicePresence(userId:bigint,input:DevicePresenceInput){
  const policy=await getRiskPolicy();
  const now=new Date();
  const ageMs=now.getTime()-input.location.capturedAt;
  const reason=input.location.isMock?'MOCK_LOCATION':input.location.accuracyMeters>policy.maxLocationAccuracyMeters?'LOW_ACCURACY':ageMs < -30_000 || ageMs > policy.maxLocationAgeSeconds*1_000?'STALE_LOCATION':null;
  if(reason)return{accepted:false,reason};
  await prisma.$transaction(async tx=>{
    await tx.deviceLocationPresence.deleteMany({where:{lastSeenAt:{lt:new Date(now.getTime()-policy.locationRetentionHours*3_600_000)}}});
    await tx.deviceLocationPresence.upsert({where:{deviceId:input.deviceId},create:{userId,deviceId:input.deviceId,latitude:input.location.latitude,longitude:input.location.longitude,accuracyMeters:input.location.accuracyMeters,lastSeenAt:now},update:{userId,latitude:input.location.latitude,longitude:input.location.longitude,accuracyMeters:input.location.accuracyMeters,lastSeenAt:now}});
  });
  return{accepted:true,expiresAt:new Date(now.getTime()+policy.presenceWindowMinutes*60_000)};
}
function validityMilliseconds(policy:RiskPolicy,context:RiskAssessmentContext){return context==='login'?policy.loginValidityHours*3_600_000:(context==='reward'?policy.rewardValidityMinutes:policy.withdrawalValidityMinutes)*60_000;}
/** 返回最近检测是否满足登录、广告奖励或提现场景的有效期。 */
export async function getRiskAssessmentStatus(userId:bigint,context:RiskAssessmentContext){const policy=await getRiskPolicy();const latest=await prisma.deviceRiskAssessment.findFirst({where:{userId},orderBy:{createdAt:'desc'},select:{id:true,score:true,knownChecks:true,autoBanned:true,createdAt:true}});const expiresAt=latest?new Date(latest.createdAt.getTime()+validityMilliseconds(policy,context)):null;const fresh=Boolean(expiresAt&&expiresAt.getTime()>Date.now()&&latest&&latest.knownChecks>=policy.minKnownChecks&&!latest.autoBanned&&latest.score>=policy.autoBanThreshold);return{context,fresh,required:policy.enabled&&policy.requireFreshAssessment,latest,expiresAt};}
/** 强制模式开启后，高价值操作必须存在对应时效内的设备检测。 */
export async function assertFreshRiskAssessment(userId:bigint,context:'reward'|'withdrawal'){const status=await getRiskAssessmentStatus(userId,context);if(status.required&&!status.fresh)throw new AppError(403,3402,context==='reward'?'设备安全检测已过期，请重新检测后观看广告':'设备安全检测已过期，请重新检测后提现',{context,expiresAt:status.expiresAt});return status;}
export async function updateRiskPolicy(operatorId:bigint,data:RiskPolicy,req:AuditRequest){return prisma.$transaction(async tx=>{const item=await tx.systemConfig.upsert({where:{key:'risk.device_policy'},create:{key:'risk.device_policy',value:data,description:'设备环境评分、关联账号和自动封号策略'},update:{value:data}});await tx.auditLog.create({data:{operatorId,action:'risk.policy.update',method:req.method,path:req.path,targetType:'system_config',targetId:item.key,ip:req.ip,userAgent:req.header('user-agent'),detail:data}});return item.value;});}
export async function getRiskDashboard(){const policy=await getRiskPolicy();const [total,banned,warning,pending,feedbackPending,reportPending,average]=await prisma.$transaction([prisma.deviceRiskAssessment.count(),prisma.deviceRiskAssessment.count({where:{autoBanned:true}}),prisma.deviceRiskAssessment.count({where:{score:{gte:policy.autoBanThreshold,lt:policy.warningThreshold}}}),prisma.riskEvent.count({where:{status:'PENDING'}}),prisma.feedback.count({where:{status:{in:['PENDING','PROCESSING']}}}),prisma.report.count({where:{status:{in:['PENDING','PROCESSING']}}}),prisma.deviceRiskAssessment.aggregate({_avg:{score:true}})]);return{totalAssessments:total,autoBanned:banned,warningAssessments:warning,pendingEvents:pending,feedbackPending,reportPending,averageScore:average._avg.score??0};}
