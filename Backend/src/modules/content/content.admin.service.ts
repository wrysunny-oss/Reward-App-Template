import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { env } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { getPangleCategories } from "./pangle-content.client.js";
import { listDramas } from "./content.service.js";
import type { AdminDramaListQuery } from "./content.schema.js";
import { getAdRuntimeConfig } from "../operation/ad-runtime.service.js";

const DEFAULT_CALLBACK_SECRET = "local-pangle-callback-secret-change-me";

export async function getContentCenter(query: AdminDramaListQuery) {
  const where: Prisma.DramaWhereInput = {
    ...(query.provider ? { provider: query.provider } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword ? {
      OR: [
        { title: { contains: query.keyword } },
        { externalId: { contains: query.keyword } },
        { category: { contains: query.keyword } },
      ],
    } : {}),
  };
  const [list, total, all, published, pangle, invalidMappings, validatedPangle, latestPangle] = await prisma.$transaction([
    prisma.drama.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        _count: { select: { episodes: true, favorites: true, histories: true } },
        playbackValidations: {
          where: { playbackStartedAt: { not: null } },
          orderBy: { playbackStartedAt: "desc" },
          take: 1,
          select: {
            requestSucceededAt: true,
            playbackStartedAt: true,
            deviceModel: true,
            abi: true,
            sdkVersion: true,
            appVersion: true,
          },
        },
      },
    }),
    prisma.drama.count({ where }),
    prisma.drama.count(),
    prisma.drama.count({ where: { status: "PUBLISHED" } }),
    prisma.drama.count({ where: { provider: "PANGLE" } }),
    prisma.drama.count({
      where: {
        provider: "PANGLE",
        OR: [{ externalId: null }, { externalId: "" }, { externalEpisodeCount: { lte: 0 } }],
      },
    }),
    prisma.drama.count({
      where: { provider: "PANGLE", playbackValidations: { some: { playbackStartedAt: { not: null } } } },
    }),
    prisma.drama.findFirst({
      where: { provider: "PANGLE" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  return {
    list: list.map((item) => {
      const { playbackValidations, ...drama } = item;
      const validation = playbackValidations[0] ?? null;
      return {
        ...drama,
        id: item.id.toString(),
        viewCount: item.viewCount.toString(),
        validation,
        mappingStatus: item.provider === "PANGLE"
          ? item.externalId && item.externalEpisodeCount > 0
            ? validation ? "READY" : "READY_TO_VALIDATE"
            : "INVALID"
          : item._count.episodes > 0 ? "READY" : "NO_EPISODES",
        playbackMode: item.provider === "PANGLE" ? "PANGLE_NATIVE_SDK" : "DIRECT_URL",
      };
    }),
    page: query.page,
    pageSize: query.pageSize,
    total,
    summary: {
      total: all,
      published,
      pangle,
      invalidMappings,
      validatedPangle,
      latestPangleSyncAt: latestPangle?.updatedAt ?? null,
    },
  };
}

/** 手动同步平台最新一页内容；完整内容仍会在 App 分页访问时持续增量落库。 */
export async function syncLatestPangleDramas(
  operatorId: bigint,
  request: Pick<Request, "header" | "ip" | "method" | "path">,
) {
  const result = await listDramas({ page: 1, pageSize: 50 }, 1);
  await prisma.auditLog.create({
    data: {
      operatorId,
      action: "content.pangle.sync",
      targetType: "drama",
      targetId: "latest",
      method: request.method,
      path: request.path,
      ip: request.ip,
      userAgent: request.header("user-agent"),
      detail: { synced: result.list.length, total: result.total, hasMore: result.hasMore },
    },
  });
  return { synced: result.list.length, total: result.total, hasMore: result.hasMore };
}

export async function getSdkHealth() {
  const runtimeConfig = await getAdRuntimeConfig();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [pangleCount, latestPangle, callbackGroups, latestCallback, latestValidation] = await prisma.$transaction([
    prisma.drama.count({ where: { provider: "PANGLE" } }),
    prisma.drama.findFirst({
      where: { provider: "PANGLE" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.adCallbackLog.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      orderBy: { status: "asc" },
      _count: true,
    }),
    prisma.adCallbackLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, reason: true, status: true },
    }),
    prisma.dramaPlaybackValidation.findFirst({
      where: { playbackStartedAt: { not: null } },
      orderBy: { playbackStartedAt: "desc" },
      select: { playbackStartedAt: true, deviceModel: true, abi: true, sdkVersion: true },
    }),
  ]);
  const callback24h = Object.fromEntries(callbackGroups.map((item) => [item.status, item._count]));
  const checks = [
    {
      code: "CONTENT_CREDENTIAL",
      name: "穿山甲内容输出配置",
      status: env.PANGLE_CONTENT_SERVER_KEY ? "HEALTHY" : "ERROR",
      detail: env.PANGLE_CONTENT_SERVER_KEY
        ? `App ID ${env.PANGLE_GROMORE_APP_ID}，Server Key 已配置`
        : "未配置 PANGLE_CONTENT_SERVER_KEY",
    },
    {
      code: "CONTENT_SNAPSHOT",
      name: "短剧内容快照",
      status: pangleCount > 0 ? "HEALTHY" : env.PANGLE_CONTENT_SERVER_KEY ? "WARNING" : "UNKNOWN",
      detail: pangleCount > 0
        ? `已同步 ${pangleCount} 部，最近同步 ${latestPangle?.updatedAt.toISOString()}`
        : "尚无穿山甲短剧快照",
    },
    {
      code: "REWARD_CONFIG",
      name: "GroMore 激励广告配置",
      status: env.PANGLE_REWARD_SECURITY_KEY ? "HEALTHY" : "ERROR",
      detail: env.PANGLE_REWARD_SECURITY_KEY
        ? `广告位 ${runtimeConfig.reward.placementId}，服务端验签密钥已配置`
        : "未配置 PANGLE_REWARD_SECURITY_KEY",
    },
    {
      code: "CALLBACK_SECURITY",
      name: "广告回调安全",
      status: env.PANGLE_CALLBACK_SECRET !== DEFAULT_CALLBACK_SECRET && env.PANGLE_CALLBACK_IPS ? "HEALTHY" : "WARNING",
      detail: env.PANGLE_CALLBACK_SECRET === DEFAULT_CALLBACK_SECRET
        ? "仍在使用本地默认回调密钥"
        : env.PANGLE_CALLBACK_IPS
          ? "回调密钥与来源 IP 白名单已配置"
          : "回调密钥已配置，但未限制来源 IP",
    },
    {
      code: "CALLBACK_ACTIVITY",
      name: "最近 24 小时广告回调",
      status: callback24h.FAILED ? "WARNING" : callback24h.SUCCESS ? "HEALTHY" : "UNKNOWN",
      detail: `成功 ${callback24h.SUCCESS ?? 0}，失败 ${callback24h.FAILED ?? 0}，处理中 ${callback24h.PROCESSING ?? 0}`,
    },
    {
      code: "NATIVE_PLAYER",
      name: "App 原生播放器真机验证",
      status: latestValidation ? "HEALTHY" : "UNKNOWN",
      detail: latestValidation
        ? `最近通过 ${latestValidation.playbackStartedAt?.toISOString()}，${latestValidation.deviceModel || "未知设备"} / ${latestValidation.abi || "未知 ABI"} / SDK ${latestValidation.sdkVersion || "未知"}`
        : "尚未收到 ARM 真机通过 Pangrowth 原生 SDK 开始播放的回执",
    },
  ] as const;
  return {
    overall: checks.some((item) => item.status === "ERROR")
      ? "DEGRADED"
      : checks.some((item) => item.status !== "HEALTHY") ? "WARNING" : "HEALTHY",
    checks,
    callback24h,
    latestCallback,
    checkedAt: new Date(),
  };
}

export async function probePangleContent() {
  const startedAt = Date.now();
  try {
    const categories = await getPangleCategories(1);
    return {
      status: "HEALTHY",
      latencyMs: Date.now() - startedAt,
      categoryCount: categories.length,
      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      status: "ERROR",
      latencyMs: Date.now() - startedAt,
      categoryCount: 0,
      message: error instanceof Error ? error.message.slice(0, 300) : "穿山甲内容接口探测失败",
      checkedAt: new Date(),
    };
  }
}
