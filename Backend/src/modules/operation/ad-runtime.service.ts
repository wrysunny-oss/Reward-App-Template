import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";
import {advertisingProvider, productConfig, productModules} from "../../generated/product.generated.js";
import {
  adRuntimeConfigSchema,
  type AdRuntimeConfig,
} from "./operation.schema.js";

export const AD_RUNTIME_CONFIG_KEY = "ads.runtime_config";

type ProviderPlacementConfig = {
  splashPlacementId: string;
  feedPlacementId: string;
  fullScreenPlacementId: string;
  rewardPlacementId: string;
};
const providerConfigs = productConfig.advertising.providers as Partial<Record<string, ProviderPlacementConfig>>;
const providerConfig = providerConfigs[advertisingProvider];

export const defaultAdRuntimeConfig: AdRuntimeConfig = {
  enabled: productModules.advertising,
  splash: { enabled: true, placementId: providerConfig?.splashPlacementId ?? "000000", timeoutMs: 3000, safetyTimeoutMs: 5000 },
  feed: { enabled: true, placementId: providerConfig?.feedPlacementId ?? "000000", insertEvery: 8 },
  fullScreen: {
    enabled: true,
    placementId: providerConfig?.fullScreenPlacementId ?? "000000",
    playbackThreshold: 5,
    minimumIntervalMinutes: 20,
    loadTimeoutMs: 8000,
    showTimeoutMs: 120000,
  },
  reward: { enabled: true, placementId: providerConfig?.rewardPlacementId ?? "000000" },
};

export async function getAdRuntimeConfig() {
  const stored = await prisma.systemConfig.findUnique({ where: { key: AD_RUNTIME_CONFIG_KEY } });
  const value = stored?.value && typeof stored.value === "object" && !Array.isArray(stored.value)
    ? stored.value as Record<string, unknown>
    : {};
  const parsed = adRuntimeConfigSchema.safeParse({
    ...defaultAdRuntimeConfig,
    ...value,
  });
  return parsed.success ? parsed.data : defaultAdRuntimeConfig;
}

export async function recordAdClientEvent(
  data: {
    format: string; eventType: string; placementId: string;
    requestId?: string | null; creativeId?: string | null; adnName?: string | null;
    ecpm?: string | null; errorMessage?: string | null;
  },
  request: Pick<Request, "header">,
) {
  const deviceId = request.header("x-device-id")?.trim();
  await prisma.adClientEvent.create({
    data: {
      format: data.format,
      eventType: data.eventType,
      placementId: data.placementId,
      requestId: data.requestId || null,
      creativeId: data.creativeId || null,
      adnName: data.adnName || null,
      ecpm: data.ecpm ? data.ecpm : null,
      errorMessage: data.errorMessage || null,
      deviceHash: deviceId ? createHash("sha256").update(deviceId).digest("hex") : null,
      platform: request.header("x-platform")?.slice(0, 30),
      appVersion: request.header("x-app-version")?.slice(0, 30),
    },
  });
  return { accepted: true };
}

export async function listAdClientEvents(query: { page: number; pageSize: number; format?: string; eventType?: string }) {
  const where: Prisma.AdClientEventWhereInput = {
    ...(query.format ? { format: query.format } : {}),
    ...(query.eventType ? { eventType: query.eventType } : {}),
  };
  const [list, total] = await prisma.$transaction([
    prisma.adClientEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.adClientEvent.count({ where }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

export async function getAdClientEventSummary() {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const grouped = await prisma.adClientEvent.groupBy({
    by: ["format", "eventType"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  return { since, events: grouped.map(item => ({ format: item.format, eventType: item.eventType, count: item._count._all })) };
}
