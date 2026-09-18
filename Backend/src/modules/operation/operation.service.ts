import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";
import { sanitizeDocumentContent } from "./rich-text.js";
import type { StoredImage } from "../../services/local-image-storage.js";
import { adRuntimeConfigSchema } from "./operation.schema.js";
import { AD_RUNTIME_CONFIG_KEY } from "./ad-runtime.service.js";
import { advertisingProvider, contentType, productModules } from "../../generated/product.generated.js";
import { SHORT_DRAMA_RUNTIME_CONFIG_KEY, shortDramaRuntimeConfigSchema } from "../content/short-drama-runtime.service.js";

type AuditRequest = Pick<Request, "method" | "path" | "ip" | "header">;
function audit(operatorId: bigint, action: string, targetType: string, targetId: string, request: AuditRequest, detail?: Prisma.InputJsonValue) {
  return prisma.auditLog.create({ data: { operatorId, action, targetType, targetId, method: request.method, path: request.path, ip: request.ip, userAgent: request.header("user-agent"), detail } });
}

/** App 启动聚合接口，只返回当前时间有效且已经发布的运营内容。 */
export async function getBootstrap() {
  const now = new Date();
  const activeTime = { AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }, { OR: [{ endAt: null }, { endAt: { gt: now } }] }] };
  const [slots, announcements, configs] = await prisma.$transaction([
    prisma.operationSlot.findMany({ where: { enabled: true, ...activeTime }, orderBy: [{ placement: "asc" }, { sort: "desc" }, { id: "desc" }] }),
    prisma.announcement.findMany({ where: { status: "PUBLISHED", ...activeTime }, orderBy: { id: "desc" } }),
    prisma.systemConfig.findMany(),
  ]);
  return {
    slots,
    announcements,
    configs: Object.fromEntries(configs.map((item) => [item.key, item.value])),
    modules: productModules,
    capabilities: {contentType, advertisingProvider},
  };
}

export async function getPublishedDocument(code: string) {
  const document = await prisma.appDocument.findFirstOrThrow({ where: { code, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" } });
  return { ...document, content: sanitizeDocumentContent(document.content) };
}

/** 灰度命中由 deviceId 稳定散列，同一设备不会在多次请求间反复变化。 */
export async function checkVersion(platform: "ANDROID" | "IOS", currentCode: number, deviceId: string) {
  const release = await prisma.appVersion.findFirst({ where: { platform, enabled: true, publishedAt: { lte: new Date() }, versionCode: { gt: currentCode } }, orderBy: { versionCode: "desc" } });
  if (!release) return { hasUpdate: false };
  const bucket = createHash("sha256").update(deviceId).digest().readUInt32BE(0) % 100;
  if (bucket >= release.rolloutPercent) return { hasUpdate: false };
  return { hasUpdate: true, force: currentCode < release.minVersionCode, release };
}

/** 邀请落地页只公开已经全量发布的稳定版本，避免绕过灰度策略提前传播安装包。 */
export function getLatestPublicAndroidVersion() {
  return prisma.appVersion.findFirst({
    where: {
      platform: "ANDROID",
      enabled: true,
      publishedAt: { lte: new Date() },
      rolloutPercent: 100,
    },
    orderBy: { versionCode: "desc" },
    select: {
      versionName: true,
      versionCode: true,
      downloadUrl: true,
      releaseNotes: true,
    },
  });
}

export const listSlots = () => prisma.operationSlot.findMany({ orderBy: [{ placement: "asc" }, { sort: "desc" }] });
export async function createSlot(operatorId: bigint, data: Prisma.OperationSlotCreateInput, request: AuditRequest) { const item = await prisma.operationSlot.create({ data }); await audit(operatorId, "operation.slot.create", "operation_slot", item.id.toString(), request); return item; }
export async function updateSlot(operatorId: bigint, id: bigint, data: Prisma.OperationSlotUpdateInput, request: AuditRequest) { const item = await prisma.operationSlot.update({ where: { id }, data }); await audit(operatorId, "operation.slot.update", "operation_slot", id.toString(), request); return item; }
export async function deleteSlot(operatorId: bigint, id: bigint, request: AuditRequest) { const item = await prisma.operationSlot.delete({ where: { id } }); await audit(operatorId, "operation.slot.delete", "operation_slot", id.toString(), request); return item; }

export const listAnnouncements = () => prisma.announcement.findMany({ orderBy: { id: "desc" } });
export async function createAnnouncement(operatorId: bigint, data: Prisma.AnnouncementCreateInput, request: AuditRequest) { const item = await prisma.announcement.create({ data: { ...data, ...(data.status === "PUBLISHED" ? {} : {}) } }); await audit(operatorId, "operation.announcement.create", "announcement", item.id.toString(), request); return item; }
export async function updateAnnouncement(operatorId: bigint, id: bigint, data: Prisma.AnnouncementUpdateInput, request: AuditRequest) { const item = await prisma.announcement.update({ where: { id }, data }); await audit(operatorId, "operation.announcement.update", "announcement", id.toString(), request); return item; }
export async function deleteAnnouncement(operatorId: bigint, id: bigint, request: AuditRequest) { const item = await prisma.announcement.delete({ where: { id } }); await audit(operatorId, "operation.announcement.delete", "announcement", id.toString(), request); return item; }

export const listConfigs = () => prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
export async function updateConfig(operatorId: bigint, key: string, data: { value: Prisma.InputJsonValue; description?: string | null }, request: AuditRequest) {
  const value = key === AD_RUNTIME_CONFIG_KEY
    ? adRuntimeConfigSchema.parse(data.value) as Prisma.InputJsonValue
    : key === SHORT_DRAMA_RUNTIME_CONFIG_KEY
      ? shortDramaRuntimeConfigSchema.parse(data.value) as Prisma.InputJsonValue
      : data.value;
  const normalized = { ...data, value };
  const item = await prisma.systemConfig.upsert({ where: { key }, create: { key, ...normalized }, update: normalized });
  await audit(operatorId, "operation.config.update", "system_config", key, request, { value });
  return item;
}

export async function listDocuments() {
  const documents = await prisma.appDocument.findMany({ orderBy: [{ code: "asc" }, { id: "desc" }] });
  return documents.map((document) => ({ ...document, content: sanitizeDocumentContent(document.content) }));
}
export async function createDocument(operatorId: bigint, data: Prisma.AppDocumentCreateInput, request: AuditRequest) { const item = await prisma.appDocument.create({ data: { ...data, content: sanitizeDocumentContent(String(data.content)), publishedAt: data.status === "PUBLISHED" ? new Date() : null } }); await audit(operatorId, "operation.document.create", "app_document", item.id.toString(), request); return item; }
export async function updateDocument(operatorId: bigint, id: bigint, data: Prisma.AppDocumentUpdateInput, request: AuditRequest) { const item = await prisma.appDocument.update({ where: { id }, data: { ...data, ...(typeof data.content === "string" ? { content: sanitizeDocumentContent(data.content) } : {}), ...(data.status === "PUBLISHED" ? { publishedAt: new Date() } : {}) } }); await audit(operatorId, "operation.document.update", "app_document", id.toString(), request); return item; }

export const listVersions = () => prisma.appVersion.findMany({ orderBy: [{ platform: "asc" }, { versionCode: "desc" }] });
export async function createVersion(operatorId: bigint, data: Prisma.AppVersionCreateInput, request: AuditRequest) { const item = await prisma.appVersion.create({ data }); await audit(operatorId, "operation.version.create", "app_version", item.id.toString(), request); return item; }
export async function updateVersion(operatorId: bigint, id: bigint, data: Prisma.AppVersionUpdateInput, request: AuditRequest) { const item = await prisma.appVersion.update({ where: { id }, data }); await audit(operatorId, "operation.version.update", "app_version", id.toString(), request); return item; }

export async function recordUpload(operatorId: bigint, image: StoredImage) {
  return prisma.mediaAsset.create({ data: { originalName: image.originalName, storageKey: image.storageKey, url: image.url, mimeType: image.mimeType, size: image.size, uploaderId: operatorId } });
}
