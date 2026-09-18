import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// 后端经常由工作区根目录、Backend 目录或编译后的 dist 目录启动。
// dotenv 默认只按 process.cwd() 查找，会导致同一套代码因启动目录不同而漏读 Backend/.env。
const envCandidates = [
  fileURLToPath(new URL("../.env", import.meta.url)),
  fileURLToPath(new URL("../../.env", import.meta.url)),
  fileURLToPath(new URL("../../../Backend/.env", import.meta.url)),
];
const envFile = envCandidates.find((candidate) => existsSync(candidate));
if (envFile) dotenv.config({ path: envFile });

const optionalString = (minimumLength = 1) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(minimumLength).optional(),
  );

const tokenDuration = z
  .string()
  .regex(/^[1-9]\d*(s|m|h|d)$/, "令牌有效期格式应为数字加 s、m、h 或 d，例如 24h");

/** 启动时集中校验配置，避免服务带着缺失密钥或错误端口继续运行。 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BRAND_NAME: z.string().trim().min(1).default("富商剧场"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: tokenDuration.default("15m"),
  ADMIN_ACCESS_TOKEN_EXPIRES_IN: tokenDuration.default("24h"),
  REFRESH_TOKEN_EXPIRES_IN: tokenDuration.default("30d"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  WITHDRAW_DATA_SECRET: z.string().min(32),
  PANGLE_CALLBACK_SECRET: z
    .string()
    .min(32)
    .default("local-pangle-callback-secret-change-me"),
  PANGLE_CALLBACK_IPS: z.string().default(""),
  /** GroMore 广告位维度服务端验证使用的 m-key，只允许保存在后端环境变量。 */
  PANGLE_REWARD_SECURITY_KEY: z.string().min(16).optional(),
  /** eCPM 加密防护的 RSA 私钥，仅用于服务端解密客户端回传的 rs_info。 */
  PANGLE_RSS_PRIVATE_KEY: z.string().min(32).optional(),
  PANGLE_GROMORE_APP_ID: z.string().default("5879132"),
  PANGLE_GROMORE_REWARDED_PLACEMENT_ID: z.string().default("104489019"),
  /** 内容输出服务端接口密钥，严禁下发到 APP 或写入接口响应。 */
  PANGLE_CONTENT_SERVER_KEY: z.string().min(16).optional(),
  /** 支付宝商家转账配置；支持证书模式（推荐）或支付宝公钥模式。 */
  ALIPAY_APP_ID: optionalString(8),
  ALIPAY_PRIVATE_KEY: optionalString(64),
  ALIPAY_PUBLIC_KEY: optionalString(64),
  ALIPAY_APP_CERT_PATH: optionalString(),
  ALIPAY_PUBLIC_CERT_PATH: optionalString(),
  ALIPAY_ROOT_CERT_PATH: optionalString(),
  ALIPAY_KEY_TYPE: z.enum(["PKCS1", "PKCS8"]).default("PKCS8"),
  ALIPAY_ENDPOINT: z.string().url().default("https://openapi.alipay.com"),
  /** 必须与支付宝商家平台“资金管理 - 转账场景”中已申报通过的场景一致。 */
  ALIPAY_TRANSFER_SCENE_NAME: z
    .enum([
      "现金营销",
      "企业退款",
      "佣金报酬",
      "业务结算",
      "二手回收",
      "公益补助",
      "行政补贴和退款",
      "保险理赔",
    ])
    .default("现金营销"),
  /** 阿里云短信仅在后端调用；生产环境优先通过 RAM 角色或最小权限 RAM 用户提供凭据。 */
  ALIBABA_CLOUD_ACCESS_KEY_ID: optionalString(8),
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: optionalString(16),
  ALIYUN_SMS_SIGN_NAME: optionalString(1),
  ALIYUN_SMS_REGISTER_TEMPLATE_CODE: optionalString(5),
  SMS_CODE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  SMS_CODE_RESEND_SECONDS: z.coerce.number().int().min(30).max(300).default(60),
  SMS_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  /** 本地图片目录；生产环境应配置到不会随应用发布被覆盖的数据盘。 */
  UPLOAD_DIRECTORY: z.string().trim().min(1).default("uploads"),
  UPLOAD_MAX_IMAGE_MB: z.coerce.number().int().min(1).max(20).default(5),
});

export const env = schema.parse(process.env);
/** 接口文档仅在开发/测试环境默认开放，生产环境必须显式启用。 */
export const apiDocsEnabled = env.API_DOCS_ENABLED
  ? env.API_DOCS_ENABLED === "true"
  : env.NODE_ENV !== "production";
// 只允许白名单中的前端来源跨域访问，不在生产环境使用通配符。
export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((item) => item.trim())
  .filter(Boolean);
