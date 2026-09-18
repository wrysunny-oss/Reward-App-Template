import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { pinoHttp } from "pino-http";
import { apiDocsEnabled, corsOrigins, env } from "./config.js";
import { ok } from "./lib/http.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { requestContext } from "./middleware/request.js";
import { openApiDocument } from "./docs/openapi.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import { uploadRoot } from "./services/local-image-storage.js";
import authRoutes from "./modules/auth/auth.routes.js";
import contentRoutes from "./modules/content/content.routes.js";
import libraryRoutes from "./modules/library/library.routes.js";
import rewardRoutes from "./modules/reward/reward.routes.js";
import withdrawalRoutes from "./modules/withdrawal/withdrawal.routes.js";
import operationRoutes from "./modules/operation/operation.routes.js";
import safetyRoutes from "./modules/safety/safety.routes.js";
import webhookRoutes from "./modules/webhook/webhook.routes.js";
import notificationRoutes from "./modules/notification/notification.routes.js";
import * as operationService from "./modules/operation/operation.service.js";
import { renderDownloadPage } from "./modules/operation/invite-page.js";
import { requireProductModules } from "./middleware/product-module.js";
import { productModules } from "./generated/product.generated.js";

export const app = express();
// 反向代理后的真实 IP 会用于限流、访问日志和后台审计。
app.set("trust proxy", 1);
// 注册顺序很重要：上下文最先建立，业务路由居中，404 与错误出口始终放在最后。
app.use(requestContext);
app.use(pinoHttp());
// 文档必须先于全局 Helmet 注册；生产环境默认不注册路由，避免仅隐藏菜单但仍可公网访问。
if (apiDocsEnabled) {
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: `${env.APP_BRAND_NAME} API 文档` }));
}
app.use(helmet());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  exposedHeaders: ["X-Request-Id", "Retry-After"],
}));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
// 本地持久化图片服务；H5 与 API 使用不同端口，因此允许资源被跨源页面加载。
// 生产环境通过 UPLOAD_DIRECTORY 指向独立数据盘，并与数据库同步备份。
app.use("/uploads", express.static(uploadRoot, {
  immutable: true,
  maxAge: "7d",
  setHeaders: (res) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
}));

// 轻量存活检查不访问数据库；部署时可另外增加包含数据库检查的 readiness 接口。
app.get("/health", (_req, res) => ok(res, { status: "up", timestamp: new Date() }));
/** GET /ready：检查服务进程和数据库是否同时可用，供负载均衡器决定是否接收流量。 */
app.get("/ready", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; return ok(res, { status: "ready", database: "up", timestamp: new Date() }); }
  catch { return res.status(503).json({ code: 1503, message: "数据库暂不可用", data: { status: "not_ready", database: "down" }, requestId: res.locals.requestId }); }
});
function readInviteCode(value: unknown) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : undefined;
}

/** GET /download：官方下载页；携带合法 code 参数时展示好友邀请码。 */
app.get("/download", async (req, res) => {
  const inviteCode = productModules.invitations ? readInviteCode(req.query.code) : undefined;
  const release = await operationService.getLatestPublicAndroidVersion();
  res.setHeader("Cache-Control", "no-store");
  return res.type("html").send(renderDownloadPage({ brandName: env.APP_BRAND_NAME, inviteCode, release }));
});

/** GET /invite：兼容已经分享出去的历史二维码。 */
app.get("/invite", async (req, res) => {
  const inviteCode = productModules.invitations ? readInviteCode(req.query.code) : undefined;
  const release = await operationService.getLatestPublicAndroidVersion();
  res.setHeader("Cache-Control", "no-store");
  return res.type("html").send(renderDownloadPage({ brandName: env.APP_BRAND_NAME, inviteCode, release }));
});
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/content", requireProductModules("shortDrama"), contentRoutes);
app.use("/api/v1/library", requireProductModules("shortDrama"), libraryRoutes);
app.use("/api/v1/rewards", rewardRoutes);
app.use("/api/v1/withdrawals", requireProductModules("withdrawals"), withdrawalRoutes);
app.use("/api/v1/operations", operationRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/safety", safetyRoutes);
app.use("/api/v1/webhooks", requireProductModules("advertising", "rewards"), webhookRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use(notFound);
app.use(errorHandler);
