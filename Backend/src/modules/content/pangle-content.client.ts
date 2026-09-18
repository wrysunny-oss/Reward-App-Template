import { createHmac, randomBytes } from "node:crypto";
import { env } from "../../config.js";
import { AppError } from "../../lib/http.js";

const API_BASE_URL = "https://csj-sp.csjdeveloper.com";
const API_VERSION = "1.0";

export interface PangleCategory {
  id: number;
  name: string;
  level: number;
  children?: PangleCategory[];
}

export interface PangleDrama {
  shortplay_id: number;
  title: string;
  desc?: string;
  cover_image: string;
  category_id: number;
  category_name: string;
  total: number;
  create_time: number;
  status: number;
  favorite_count?: number;
  level_label?: number;
  is_potential?: boolean;
  icp_number?: string;
}

interface PangleResponse<T> {
  ret: number;
  sub_ret?: string;
  msg?: string;
  request_id?: string;
  data?: T;
}

/**
 * 按穿山甲文档顺序拼接公共参数和原始 JSON body，再使用 Server Key 做 HMAC-SHA256。
 * 导出该函数是为了能够通过单元测试锁定签名顺序，防止重构 JSON 或请求头时破坏鉴权。
 */
export function createPangleContentSign(
  timestamp: string,
  siteId: string,
  nonce: string,
  body: string,
  serverKey: string,
) {
  const payload = `${timestamp}${siteId}${API_VERSION}${nonce}${body}`;
  return createHmac("sha256", serverKey).update(payload, "utf8").digest("hex");
}

async function requestPangle<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const serverKey = env.PANGLE_CONTENT_SERVER_KEY;
  if (!serverKey) throw new AppError(503, 2301, "穿山甲内容服务尚未配置 Server Key");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(8).toString("hex");
  const body = JSON.stringify(payload);
  const sign = createPangleContentSign(timestamp, env.PANGLE_GROMORE_APP_ID, nonce, body, serverKey);
  const controller = new AbortController();
  // 平台类目接口首次请求可能需要冷启动；20 秒仍能避免请求无限占用连接。
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csj-sp-site-id": env.PANGLE_GROMORE_APP_ID,
        "x-csj-sp-timestamp": timestamp,
        "x-csj-sp-sign": sign,
        "x-csj-sp-nonce": nonce,
        "x-csj-sp-version": API_VERSION,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new AppError(502, 2302, `穿山甲内容服务 HTTP ${response.status}`);
    const result = await response.json() as PangleResponse<T>;
    if (result.ret !== 0 || !result.data) {
      throw new AppError(502, 2303, result.msg || "穿山甲内容服务返回失败", {
        subRet: result.sub_ret,
        requestId: result.request_id,
      });
    }
    return result.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error && error.name === "AbortError"
      ? "穿山甲内容服务请求超时"
      : "穿山甲内容服务暂时不可用";
    throw new AppError(502, 2304, message);
  } finally {
    clearTimeout(timer);
  }
}

/** 获取平台实时类目；uid=0 代表未登录的公共首页请求。 */
export async function getPangleCategories(uid = 0) {
  const data = await requestPangle<{ list: PangleCategory[] }>(
    "/csj_sp/openapi/v1/shortplay/get_category",
    { uid },
  );
  return data.list || [];
}

/** 获取平台实时短剧物料；播放仍由 Android 内容 SDK 完成。 */
export async function getPangleDramas(options: {
  uid?: number;
  page: number;
  pageSize: number;
  categoryId?: number;
}) {
  const categoryIds = options.categoryId ? [options.categoryId] : undefined;
  return requestPangle<{ list: PangleDrama[]; total: number; has_more: boolean }>(
    "/csj_sp/openapi/v1/shortplay/get_sp_list",
    {
      uid: options.uid || 0,
      page: options.page,
      page_size: options.pageSize,
      order: 1,
      query_type: categoryIds ? "category" : "all",
      ...(categoryIds ? { category_id: categoryIds } : {}),
    },
  );
}
