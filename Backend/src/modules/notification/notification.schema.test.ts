import assert from "node:assert/strict";
import test from "node:test";
import { sendNotificationSchema } from "./notification.schema.js";

const base = { type: "SYSTEM", title: "系统通知", content: "通知内容" };

test("全量站内信不要求手机号", () => {
  assert.equal(sendNotificationSchema.safeParse({ ...base, target: "ALL" }).success, true);
});

test("定向站内信必须提供正确手机号", () => {
  assert.equal(sendNotificationSchema.safeParse({ ...base, target: "USER" }).success, false);
  assert.equal(sendNotificationSchema.safeParse({ ...base, target: "USER", phone: "13800138000" }).success, true);
});
