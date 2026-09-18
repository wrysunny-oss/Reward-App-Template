import type {Request} from "express";
import type {AdRewardFormat} from "../admin/admin.service.js";
import {settleAdReward} from "../admin/admin.service.js";

export type RewardProvider = "gromore" | "pangle" | "taku";

export interface RewardEvent {
  provider: RewardProvider;
  eventId: string;
  userId: bigint;
  placementId?: string;
  revenueYuan: string;
  source: string;
  format: AdRewardFormat;
  enforceDailyLimit?: boolean;
  context?: {
    purpose: "CONTENT_UNLOCK";
    contentType: string;
    contentId: string;
    unitId?: string;
  };
}

/** 广告平台适配器完成验签后，只能通过统一事件进入奖励结算。 */
export function settleRewardEvent(event: RewardEvent, request: Pick<Request, "method" | "path" | "ip" | "header">) {
  return settleAdReward(null, {
    requestId: event.eventId,
    userId: event.userId,
    revenueYuan: event.revenueYuan,
    source: event.source,
    format: event.format,
    enforceDailyLimit: event.enforceDailyLimit,
  }, request);
}
