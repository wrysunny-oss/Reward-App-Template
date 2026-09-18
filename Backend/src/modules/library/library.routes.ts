import { Router } from "express";
import { ok } from "../../lib/http.js";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/request.js";
import { dramaIdSchema, sdkLibrarySyncSchema, watchProgressSchema, type SdkLibrarySyncInput } from "./library.schema.js";
import * as libraryService from "./library.service.js";

const router = Router();

// 整个资料库都属于用户私有数据，在路由组入口统一要求登录。
router.use(authenticate);

/** GET /favorites：获取当前用户收藏列表；需要登录。 */
router.get("/favorites", async (req, res) =>
  ok(res, await libraryService.listFavorites(req.auth!.userId)),
);
/** PUT /favorites/:dramaId：幂等收藏指定短剧；需要登录。 */
router.put(
  "/favorites/:dramaId",
  validate(dramaIdSchema, "params"),
  async (req, res) => {
    await libraryService.addFavorite(
      req.auth!.userId,
      BigInt(String(req.params.dramaId)),
    );
    return ok(res, null, "已收藏");
  },
);
/** DELETE /favorites/:dramaId：幂等取消指定短剧收藏；需要登录。 */
router.delete(
  "/favorites/:dramaId",
  validate(dramaIdSchema, "params"),
  async (req, res) => {
    await libraryService.removeFavorite(
      req.auth!.userId,
      BigInt(String(req.params.dramaId)),
    );
    return ok(res, null, "已取消收藏");
  },
);

/** GET /history：获取当前用户最近观看进度；需要登录。 */
router.get("/history", async (req, res) =>
  ok(res, await libraryService.listHistory(req.auth!.userId)),
);
/** PUT /history/:dramaId：保存剧集和播放秒数，相同短剧覆盖更新；需要登录。 */
router.put(
  "/history/:dramaId",
  validate(dramaIdSchema, "params"),
  validate(watchProgressSchema),
  async (req, res) => {
    const result = await libraryService.saveProgress(
      req.auth!.userId,
      BigInt(String(req.params.dramaId)),
      req.body.episodeId,
      req.body.positionSeconds,
    );
    return ok(res, result);
  },
);

/** POST /sdk-sync：幂等接收穿山甲播放器关闭后产生的收藏和历史差异。 */
router.post('/sdk-sync', validate(sdkLibrarySyncSchema), async (req, res) =>
  ok(res, await libraryService.syncSdkLibrary(req.auth!.userId, req.body as SdkLibrarySyncInput, req)),
);

export default router;
