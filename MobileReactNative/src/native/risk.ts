import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {appApi} from '../api/app';
import {saveDeviceId} from '../api/client';
import type {
  RiskAssessmentResult,
  RiskCheckStatus,
  RiskContext,
} from '../types/api';

export interface RiskLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: number;
  isMock: boolean;
}

export interface RiskSignals {
  deviceId: string;
  simStatus: RiskCheckStatus;
  wechatStatus: RiskCheckStatus;
  douyinStatus: RiskCheckStatus;
  alipayStatus: RiskCheckStatus;
  emulatorStatus: RiskCheckStatus;
  cloudDeviceStatus: RiskCheckStatus;
  scriptStatus: RiskCheckStatus;
  networkStatus: RiskCheckStatus;
  ipStatus: RiskCheckStatus;
  location?: RiskLocation;
  evidence: Record<string, string | number | boolean>;
}

interface NativeRiskCollector {
  collect(nonce: string): Promise<RiskSignals>;
  collectLocation(): Promise<{deviceId: string; location?: RiskLocation}>;
}

export interface RiskCheckOutcome {
  skipped: boolean;
  reason?: string;
  assessment?: RiskAssessmentResult;
}

const nativeModule = NativeModules.RiskCollector as NativeRiskCollector | undefined;
const PERMISSION_PROMPTED_KEY = 'hly_risk_permissions_prompted_v1';
const inFlight = new Map<RiskContext, Promise<RiskCheckOutcome>>();
let presenceInFlight: Promise<void> | undefined;
class RiskBlockedError extends Error {}

/**
 * 风控权限只主动申请一次。用户拒绝后原生信号会返回 UNKNOWN，不会把“拒绝权限”
 * 直接当作风险；用户仍可稍后在系统设置里手动开启。
 */
async function requestRiskPermissionsOnce() {
  if (Platform.OS !== 'android' || Platform.Version < 23) return;
  if (await AsyncStorage.getItem(PERMISSION_PROMPTED_KEY)) return;

  const permissions = [
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ];
  const missing: typeof permissions = [];
  for (const permission of permissions) {
    if (!(await PermissionsAndroid.check(permission))) missing.push(permission);
  }
  if (missing.length) await PermissionsAndroid.requestMultiple(missing);
  await AsyncStorage.setItem(PERMISSION_PROMPTED_KEY, new Date().toISOString());
}

/** 原生模块的低层入口，调用者必须使用服务端下发的 nonce。 */
export const riskNative = {
  available: Platform.OS === 'android' && Boolean(nativeModule),
  collect: (nonce: string) =>
    nativeModule
      ? nativeModule.collect(nonce)
      : Promise.reject(new Error('Android 风控模块未安装')),
};

/**
 * APP 前台活跃心跳。失败不会打断页面使用，服务端只接受非模拟、足够精确且新鲜的位置。
 */
export function sendRiskPresenceHeartbeat(): Promise<void> {
  if (presenceInFlight) return presenceInFlight;
  presenceInFlight = (async () => {
    if (!nativeModule || Platform.OS !== 'android') return;
    await requestRiskPermissionsOnce();
    const result = await nativeModule.collectLocation();
    if (!result.location) return;
    await saveDeviceId(result.deviceId);
    await appApi.updateDevicePresence({
      deviceId: result.deviceId,
      location: result.location,
    });
  })()
    .catch(() => undefined)
    .finally(() => {
      presenceInFlight = undefined;
    });
  return presenceInFlight;
}

/**
 * 完成“有效期查询 → 权限 → 一次性挑战 → 原生采集 → 服务端评分”闭环。
 * 同一业务场景的并发调用会复用同一个 Promise，避免消耗多个一次性挑战。
 */
export function ensureRiskAssessment(context: RiskContext): Promise<RiskCheckOutcome> {
  const existing = inFlight.get(context);
  if (existing) return existing;

  const task = (async (): Promise<RiskCheckOutcome> => {
    const status = await appApi.riskAssessmentStatus(context);
    // 附近设备规则依赖短时间活跃位置，即使旧评分仍有效也要重新采集一次，
    // 否则无法判断“最近若干分钟正在运行本 APP 的设备数”。
    if (!riskNative.available) {
      if (status.required) throw new Error('当前设备无法执行安全检测，请重新安装最新版 APP');
      return {skipped: true, reason: 'native-module-unavailable'};
    }

    try {
      await requestRiskPermissionsOnce();
      const challenge = await appApi.createRiskChallenge(context);
      const signals = await riskNative.collect(challenge.nonce);
      await saveDeviceId(signals.deviceId);
      const {location, ...baseSignals} = signals;
      const assessment = await appApi.submitRiskAssessment({
        challengeId: challenge.id,
        ...baseSignals,
        ...(location ? {location} : {}),
      });
      if (assessment.autoBanned) {
        throw new RiskBlockedError(`设备环境评分 ${assessment.score} 分，账号已被系统限制`);
      }
      if (status.required && !assessment.eligibleForDecision) {
        throw new Error(`设备安全信息不足（${assessment.knownChecks}/10），请授予必要权限后重试`);
      }
      return {skipped: false, assessment};
    } catch (error) {
      if (error instanceof RiskBlockedError) throw error;
      // 后台未开启“强制近期检测”时，采集器或权限异常不阻断普通业务。
      if (!status.required) {
        return {
          skipped: true,
          reason: error instanceof Error ? error.message : 'risk-check-failed',
        };
      }
      throw error;
    }
  })().finally(() => inFlight.delete(context));

  inFlight.set(context, task);
  return task;
}
