import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlipaySdk } from "alipay-sdk";
import { env } from "../../config.js";
import { AppError } from "../../lib/http.js";

const PRODUCT_CODE = "TRANS_ACCOUNT_NO_PWD";
const BIZ_SCENE = "DIRECT_TRANSFER";
const runtimeRoot = fileURLToPath(new URL("../../../", import.meta.url));
const backendRoot = existsSync(resolve(runtimeRoot, "package.json")) ? runtimeRoot : resolve(runtimeRoot, "..");

type AlipayTransferData = {
  code?: string;
  message?: string;
  outBizNo?: string;
  orderId?: string;
  payFundOrderId?: string;
  status?: string;
  subCode?: string;
  subMsg?: string;
};

type TransferSceneName = typeof env.ALIPAY_TRANSFER_SCENE_NAME;

const transferSceneReportInfo: Record<TransferSceneName, Array<{ info_type: string; info_content: string }>> = {
  "现金营销": [
    { info_type: "活动名称", info_content: `${env.APP_BRAND_NAME}金币奖励活动` },
    { info_type: "奖励说明", info_content: "用户参与观剧及平台任务获得金币提现" },
  ],
  "企业退款": [{ info_type: "退款原因", info_content: "用户平台账户余额退款" }],
  "佣金报酬": [{ info_type: "佣金报酬说明", info_content: "用户参与平台推广及任务获得报酬" }],
  "业务结算": [{ info_type: "结算款项名称", info_content: "平台用户任务奖励结算" }],
  "二手回收": [{ info_type: "回收商品名称", info_content: "二手商品回收款" }],
  "公益补助": [{ info_type: "公益活动名称", info_content: "公益活动补助" }],
  "行政补贴和退款": [{ info_type: "补贴/退款类型", info_content: "行政补贴或退款" }],
  "保险理赔": [{ info_type: "保险理赔说明", info_content: "保险理赔款" }],
};

export type AlipayPayoutResult = {
  outBizNo: string;
  orderId?: string;
  payFundOrderId?: string;
  status: string;
  traceId?: string;
  failureReason?: string;
};

function normalizeSecret(value: string | undefined) {
  return value?.replaceAll("\\n", "\n").trim();
}

function resolveCertPath(value: string | undefined) {
  if (!value) return undefined;
  return resolve(backendRoot, value);
}

export function getAlipayPayoutReadiness() {
  const missing: string[] = [];
  if (!env.ALIPAY_APP_ID) missing.push("ALIPAY_APP_ID");
  if (!env.ALIPAY_PRIVATE_KEY) missing.push("ALIPAY_PRIVATE_KEY");

  const certificatePaths = [env.ALIPAY_APP_CERT_PATH, env.ALIPAY_PUBLIC_CERT_PATH, env.ALIPAY_ROOT_CERT_PATH];
  const usesCertificateMode = certificatePaths.some(Boolean);
  if (usesCertificateMode) {
    const names = ["ALIPAY_APP_CERT_PATH", "ALIPAY_PUBLIC_CERT_PATH", "ALIPAY_ROOT_CERT_PATH"] as const;
    names.forEach((name, index) => {
      const path = resolveCertPath(certificatePaths[index]);
      if (!path || !existsSync(path)) missing.push(name);
    });
  } else if (!env.ALIPAY_PUBLIC_KEY) {
    missing.push("ALIPAY_PUBLIC_KEY");
  }

  return {
    configured: missing.length === 0,
    mode: usesCertificateMode ? "CERTIFICATE" as const : "PUBLIC_KEY" as const,
    missing,
  };
}

function createClient() {
  const readiness = getAlipayPayoutReadiness();
  if (!readiness.configured) {
    throw new AppError(503, 3230, `支付宝打款未配置完整：${readiness.missing.join("、")}`);
  }

  return new AlipaySdk({
    appId: env.ALIPAY_APP_ID!,
    privateKey: normalizeSecret(env.ALIPAY_PRIVATE_KEY)!,
    keyType: env.ALIPAY_KEY_TYPE,
    endpoint: env.ALIPAY_ENDPOINT,
    timeout: 10_000,
    ...(readiness.mode === "CERTIFICATE" ? {
      appCertPath: resolveCertPath(env.ALIPAY_APP_CERT_PATH),
      alipayPublicCertPath: resolveCertPath(env.ALIPAY_PUBLIC_CERT_PATH),
      alipayRootCertPath: resolveCertPath(env.ALIPAY_ROOT_CERT_PATH),
    } : { alipayPublicKey: normalizeSecret(env.ALIPAY_PUBLIC_KEY) }),
  });
}

/** 每个提现单始终映射到同一个支付宝商户单号，网络重试不会产生第二笔付款。 */
export function alipayOutBizNo(withdrawalId: string) {
  return `HLW${withdrawalId.replaceAll("-", "")}`;
}

export function classifyAlipayStatus(status: string | undefined) {
  const normalized = String(status ?? "UNKNOWN").toUpperCase();
  if (["SUCCESS", "FINISHED"].includes(normalized)) return "SUCCESS" as const;
  if (["FAIL", "FAILED", "CLOSED", "REFUND", "REFUNDED"].includes(normalized)) return "FAILED" as const;
  return "PROCESSING" as const;
}

export function getAlipayTransferScene() {
  const name = env.ALIPAY_TRANSFER_SCENE_NAME;
  return {
    transfer_scene_name: name,
    transfer_scene_report_infos: transferSceneReportInfo[name],
  };
}

function mapResult(outBizNo: string, data: AlipayTransferData, traceId?: string): AlipayPayoutResult {
  return {
    outBizNo,
    orderId: data.orderId,
    payFundOrderId: data.payFundOrderId,
    status: String(data.status ?? "UNKNOWN").toUpperCase(),
    traceId,
    failureReason: data.subMsg ?? data.subCode,
  };
}

export async function transferToAlipay(input: { withdrawalId: string; amountCents: number; account: string; realName: string }) {
  const outBizNo = alipayOutBizNo(input.withdrawalId);
  const result = await createClient().curl<AlipayTransferData>("POST", "/v3/alipay/fund/trans/uni/transfer", {
    requestId: outBizNo,
    body: {
      out_biz_no: outBizNo,
      trans_amount: (input.amountCents / 100).toFixed(2),
      product_code: PRODUCT_CODE,
      biz_scene: BIZ_SCENE,
      order_title: `${env.APP_BRAND_NAME}用户提现`,
      remark: "用户金币提现",
      ...getAlipayTransferScene(),
      payee_info: {
        identity: input.account,
        identity_type: "ALIPAY_LOGON_ID",
        name: input.realName,
      },
    },
  });
  if (result.responseHttpStatus < 200 || result.responseHttpStatus >= 300) {
    throw new AppError(502, 3235, `支付宝拒绝打款请求：${result.data.message ?? result.data.code ?? result.responseHttpStatus}`);
  }
  return mapResult(outBizNo, result.data, result.traceId);
}

export async function queryAlipayTransfer(withdrawalId: string) {
  const outBizNo = alipayOutBizNo(withdrawalId);
  const result = await createClient().curl<AlipayTransferData>("GET", "/v3/alipay/fund/trans/common/query", {
    requestId: `query-${outBizNo}`,
    query: { product_code: PRODUCT_CODE, biz_scene: BIZ_SCENE, out_biz_no: outBizNo },
  });
  if (result.responseHttpStatus < 200 || result.responseHttpStatus >= 300) {
    throw new AppError(502, 3236, `支付宝查单失败：${result.data.message ?? result.data.code ?? result.responseHttpStatus}`);
  }
  return mapResult(outBizNo, result.data, result.traceId);
}
