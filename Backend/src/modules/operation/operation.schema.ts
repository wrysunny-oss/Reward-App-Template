import { z } from "zod";

const optionalDate = z.string().datetime().nullish().transform((value) => value ? new Date(value) : null);
export const operationIdSchema = z.object({ id: z.coerce.bigint().positive() });
export const documentCodeSchema = z.object({ code: z.string().trim().min(2).max(50) });
export const configKeySchema = z.object({ key: z.string().trim().min(2).max(100) });
export const slotSchema = z.object({
  placement: z.enum(["HOME_BANNER", "HOME_RECOMMEND", "STARTUP_POPUP"]),
  title: z.string().trim().min(1).max(100), imageUrl: z.string().trim().min(1).max(1000),
  targetType: z.enum(["NONE", "DRAMA", "INTERNAL", "EXTERNAL"]), targetValue: z.string().trim().max(1000).nullish(),
  sort: z.number().int().min(-99999).max(99999), enabled: z.boolean(), startAt: optionalDate, endAt: optionalDate,
}).refine((data) => !data.startAt || !data.endAt || data.endAt > data.startAt, { message: "结束时间必须晚于开始时间", path: ["endAt"] });
export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(150), content: z.string().trim().min(1).max(50_000),
  status: z.enum(["DRAFT", "PUBLISHED", "OFFLINE"]), startAt: optionalDate, endAt: optionalDate,
});
export const systemConfigSchema = z.object({ value: z.unknown(), description: z.string().trim().max(255).nullish() });
const placementId = z.string().trim().regex(/^\d{6,20}$/, "广告位 ID 格式不正确");
export const adRuntimeConfigSchema = z.object({
  enabled: z.boolean(),
  splash: z.object({
    enabled: z.boolean(), placementId,
    timeoutMs: z.number().int().min(1000).max(10_000),
    safetyTimeoutMs: z.number().int().min(2000).max(15_000),
  }),
  feed: z.object({
    enabled: z.boolean(), placementId,
    insertEvery: z.number().int().min(2).max(50),
  }),
  fullScreen: z.object({
    enabled: z.boolean(), placementId,
    playbackThreshold: z.number().int().min(1).max(100),
    minimumIntervalMinutes: z.number().int().min(1).max(1440),
    loadTimeoutMs: z.number().int().min(2000).max(30_000),
    showTimeoutMs: z.number().int().min(30_000).max(10 * 60_000),
  }),
  reward: z.object({ enabled: z.boolean(), placementId }),
  drama: z.object({
    unlockMode: z.enum(["COMMON", "SPECIFIC"]),
    freeEpisodes: z.number().int().min(0).max(1000),
    unlockEpisodes: z.number().int().min(1).max(10),
    continuousUnlock: z.boolean(),
    hideRewardDialog: z.boolean(),
    hideCellularToast: z.boolean(),
    hideLikeButton: z.boolean(),
    hideFavorButton: z.boolean(),
    hideDoubleClick: z.boolean(),
    hideLongClickSpeed: z.boolean(),
    infiniteScrollEnabled: z.boolean(),
  }),
});
export type AdRuntimeConfig = z.infer<typeof adRuntimeConfigSchema>;

export const adClientEventSchema = z.object({
  format: z.enum(["SPLASH", "FEED", "FULL_SCREEN", "REWARD", "DRAMA_UNLOCK"]),
  eventType: z.enum(["REQUEST", "LOADED", "SHOW", "CLICK", "CLOSE", "FAIL", "DISLIKE", "ECPM", "REWARD_ARRIVED"]),
  placementId,
  requestId: z.string().trim().max(100).nullish(),
  creativeId: z.string().trim().max(100).nullish(),
  adnName: z.string().trim().max(50).nullish(),
  ecpm: z.string().trim().regex(/^\d{1,10}(\.\d{1,4})?$/).nullish(),
  errorMessage: z.string().trim().max(500).nullish(),
});
export const adEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  format: z.enum(["SPLASH", "FEED", "FULL_SCREEN", "REWARD", "DRAMA_UNLOCK"]).optional(),
  eventType: z.enum(["REQUEST", "LOADED", "SHOW", "CLICK", "CLOSE", "FAIL", "DISLIKE", "ECPM", "REWARD_ARRIVED"]).optional(),
});
export const documentSchema = z.object({
  code: z.string().trim().min(2).max(50), title: z.string().trim().min(1).max(150), version: z.string().trim().min(1).max(30),
  content: z.string().trim().min(1).max(500_000), status: z.enum(["DRAFT", "PUBLISHED", "OFFLINE"]),
});
export const versionSchema = z.object({
  platform: z.enum(["ANDROID", "IOS"]), versionName: z.string().trim().min(1).max(30),
  versionCode: z.number().int().positive(), minVersionCode: z.number().int().positive(),
  downloadUrl: z.string().trim().url().max(1000), releaseNotes: z.string().trim().min(1).max(20_000),
  enabled: z.boolean(), rolloutPercent: z.number().int().min(0).max(100), publishedAt: optionalDate,
}).refine((data) => data.minVersionCode <= data.versionCode, { message: "最低版本号不能高于发布版本号", path: ["minVersionCode"] });
export const versionCheckSchema = z.object({
  platform: z.enum(["ANDROID", "IOS"]), versionCode: z.coerce.number().int().positive(), deviceId: z.string().trim().min(1).max(100),
});
