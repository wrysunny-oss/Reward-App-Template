import { Router } from "express";
import { ok } from "../../lib/http.js";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/request.js";
import { notificationIdSchema } from "./notification.schema.js";
import * as notificationService from "./notification.service.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => ok(res, await notificationService.listMine(req.auth!.userId)));
router.get("/unread-count", async (req, res) => ok(res, { count: await notificationService.unreadCount(req.auth!.userId) }));
router.put("/read-all", async (req, res) => ok(res, await notificationService.markAllRead(req.auth!.userId), "全部通知已读"));
router.put("/:id/read", validate(notificationIdSchema, "params"), async (req, res) =>
  ok(res, await notificationService.markRead(req.auth!.userId, BigInt(String(req.params.id))), "通知已读"),
);

export default router;
