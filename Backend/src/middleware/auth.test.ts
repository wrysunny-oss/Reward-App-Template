import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { denyAgentWrites, permitAny } from "./auth.js";

const response = {} as Response;
const next: NextFunction = () => undefined;

/** 构造最小请求对象，避免权限单元测试依赖数据库和真实 JWT。 */
function request(method: string, accountType: "ADMIN" | "AGENT", permissions: string[]) {
  return { method, auth: { accountType, permissions, roleCodes: [], userId: 1n } } as unknown as Request;
}

test("代理可以读取后台数据", () => {
  assert.doesNotThrow(() => denyAgentWrites(request("GET", "AGENT", ["agent:readonly"]), response, next));
});

test("代理写请求被后台总闸门拒绝", () => {
  assert.throws(() => denyAgentWrites(request("PATCH", "AGENT", ["user:update"]), response, next), /代理后台仅支持查看/);
});

test("管理员不受代理只读总闸门影响", () => {
  assert.doesNotThrow(() => denyAgentWrites(request("POST", "ADMIN", ["user:update"]), response, next));
});

test("广告查询接受管理员或代理专用权限中的任意一个", () => {
  assert.doesNotThrow(() => permitAny("reward:read", "agent:reward:read")(request("GET", "AGENT", ["agent:reward:read"]), response, next));
  assert.throws(() => permitAny("reward:read", "agent:reward:read")(request("GET", "AGENT", ["user:read"]), response, next), /无权执行/);
});
