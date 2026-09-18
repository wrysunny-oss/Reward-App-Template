import { Router } from "express";
import { ok } from "../../lib/http.js";
import { validate } from "../../middleware/request.js";
import { authenticate } from "../../middleware/auth.js";
import { contentImageQuerySchema, dramaIdSchema, dramaListQuerySchema, playbackValidationSchema, type DramaListQuery, type PlaybackValidationInput } from "./content.schema.js";
import * as contentService from "./content.service.js";
import { createHash } from "node:crypto";

const router = Router();

/** 将设备标识稳定映射为穿山甲要求的正整数 uid，不暴露真实手机号或数据库用户 ID。 */
function contentUid(deviceId: unknown) {
  const digest = createHash("sha256").update(String(deviceId || "anonymous-device")).digest();
  return (digest.readUInt32BE(0) % 2_000_000_000) + 1;
}

/** GET /categories：实时获取穿山甲短剧分类，供 APP 首页生成筛选项。 */
router.get("/categories", async (req, res) => {
  return ok(res, await contentService.listDramaCategories(contentUid(req.headers["x-device-id"])));
});

/**
 * GET /images：仅代理穿山甲返回的 byteimg HTTPS 封面，解决 Android WebView 跨源拦截。
 * 域名白名单、体积上限和超时共同防止该接口退化为任意 SSRF/大文件代理。
 */
router.get("/images", validate(contentImageQuerySchema, "query"), async (_req, res) => {
  const rawUrl = String((res.locals.validatedQuery as { url: string }).url);
  const target = new URL(rawUrl);
  if (target.protocol !== "https:" || !/(^|\.)byteimg\.com$/i.test(target.hostname)) {
    return res.status(403).json({ code: 2305, message: "不允许代理该图片域名", data: null, requestId: res.locals.requestId });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(target, {
      signal: controller.signal,
      headers: { "user-agent": "HanLe-Theater/1.0 Android" },
    });
    const length = Number(upstream.headers.get("content-length") || 0);
    if (!upstream.ok || (length && length > 5 * 1024 * 1024)) {
      return res.status(502).json({ code: 2306, message: "封面图片获取失败", data: null, requestId: res.locals.requestId });
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(502).json({ code: 2307, message: "封面图片超过大小限制", data: null, requestId: res.locals.requestId });
    }
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
  } finally {
    clearTimeout(timer);
  }
});

/** GET /dramas：分页查询已发布短剧，可使用分类和关键词筛选；公开接口。 */
router.get("/dramas", validate(dramaListQuerySchema, "query"), async (req, res) => {
  return ok(res, await contentService.listDramas(
    res.locals.validatedQuery as DramaListQuery,
    contentUid(req.headers["x-device-id"]),
  ));
});

/** POST /playback-validations：接收 Pangrowth 原生播放器的真机请求与开播回执。 */
router.post("/playback-validations", authenticate, validate(playbackValidationSchema), async (req, res) => {
  return ok(res, await contentService.recordPlaybackValidation(
    req.auth!.userId,
    req.body as PlaybackValidationInput,
    req,
  ));
});

/** GET /dramas/:id：查询单部已发布短剧及其剧集；id 为正整数，公开接口。 */
router.get("/dramas/:id", validate(dramaIdSchema, "params"), async (req, res) => {
  return ok(res, await contentService.getDrama(BigInt(String(req.params.id))));
});

export default router;
