import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import DysmsapiModule, * as $Dysmsapi20170525 from "@alicloud/dysmsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import { env } from "../config.js";
import { AppError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const PURPOSE_REGISTER = "REGISTER";
type SmsClient = {
  sendSms(request: $Dysmsapi20170525.SendSmsRequest): Promise<$Dysmsapi20170525.SendSmsResponse>;
};
// 该官方包当前发布为 CommonJS；NodeNext 运行时的构造器位于 default.default。
const DysmsapiClient = (DysmsapiModule as unknown as { default: new (config: $OpenApi.Config) => SmsClient }).default;
let client: SmsClient | null = null;

function configuredClient() {
  if (!env.ALIBABA_CLOUD_ACCESS_KEY_ID || !env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || !env.ALIYUN_SMS_SIGN_NAME || !env.ALIYUN_SMS_REGISTER_TEMPLATE_CODE) {
    throw new AppError(503, 2011, "短信服务尚未配置，请联系管理员");
  }
  if (!client) {
    const config = new $OpenApi.Config({
      accessKeyId: env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    });
    config.endpoint = "dysmsapi.aliyuncs.com";
    client = new DysmsapiClient(config);
  }
  return client;
}

function hashCode(phone: string, code: string) {
  return createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(`${PURPOSE_REGISTER}:${phone}:${code}`)
    .digest("hex");
}

/** 发送注册验证码；数据库冷却同时约束同一手机号，避免只靠 IP 限流被绕过。 */
export async function sendRegistrationCode(phone: string) {
  const existingUser = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (existingUser) throw new AppError(409, 2012, "该手机号已注册，请直接登录");

  const latest = await prisma.smsVerificationCode.findFirst({
    where: { phone, purpose: PURPOSE_REGISTER },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const retryAfter = latest
    ? env.SMS_CODE_RESEND_SECONDS - Math.floor((Date.now() - latest.createdAt.getTime()) / 1000)
    : 0;
  if (retryAfter > 0) throw new AppError(429, 2013, `请 ${retryAfter} 秒后再获取验证码`, { retryAfter });

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const record = await prisma.smsVerificationCode.create({
    data: {
      phone,
      purpose: PURPOSE_REGISTER,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + env.SMS_CODE_TTL_SECONDS * 1000),
    },
  });

  try {
    const response = await configuredClient().sendSms(new $Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: phone,
      signName: env.ALIYUN_SMS_SIGN_NAME!,
      templateCode: env.ALIYUN_SMS_REGISTER_TEMPLATE_CODE!,
      templateParam: JSON.stringify({ code }),
    }));
    const result = response.body;
    if (result?.code !== "OK") {
      throw new AppError(502, 2014, `短信发送失败：${result?.message || result?.code || "服务商未返回原因"}`);
    }
    await prisma.smsVerificationCode.update({ where: { id: record.id }, data: { providerId: result.bizId } });
    return { resendAfter: env.SMS_CODE_RESEND_SECONDS, expiresIn: env.SMS_CODE_TTL_SECONDS };
  } catch (error) {
    await prisma.smsVerificationCode.deleteMany({ where: { id: record.id } });
    if (error instanceof AppError) throw error;
    const providerMessage = error instanceof Error ? error.message : "未知错误";
    console.error("Aliyun SMS send failed", { providerMessage });
    throw new AppError(502, 2014, "验证码发送失败，请稍后重试");
  }
}

/** 校验最新一条验证码并累计失败次数；成功注册后由 consumeRegistrationCode 作废。 */
export async function verifyRegistrationCode(phone: string, code: string) {
  const record = await prisma.smsVerificationCode.findFirst({
    where: { phone, purpose: PURPOSE_REGISTER, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(422, 2015, "验证码已失效，请重新获取");
  }
  if (record.attempts >= env.SMS_CODE_MAX_ATTEMPTS) {
    throw new AppError(422, 2016, "验证码错误次数过多，请重新获取");
  }
  const actual = Buffer.from(hashCode(phone, code), "hex");
  const expected = Buffer.from(record.codeHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    await prisma.smsVerificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw new AppError(422, 2017, "验证码不正确");
  }
  return record.id;
}

export async function consumeRegistrationCode(id: string) {
  await prisma.smsVerificationCode.updateMany({
    where: { id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}
