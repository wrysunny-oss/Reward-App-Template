import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import { AppError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";

type Claims = { sub: string; type: "access" };

/**
 * 验证访问令牌后重新读取账号状态及权限。
 * 这样禁用账号或收回角色会立即生效，不需要等待 JWT 自然过期。
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AppError(401, 2001, "请先登录");
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as Claims;
    if (claims.type !== "access") throw new Error("invalid type");
    const user = await prisma.user.findFirst({
      where: { id: BigInt(claims.sub), status: "ACTIVE", riskStatus: { notIn: ["FROZEN", "BANNED"] } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!user) throw new Error("user unavailable");
    const roleCodes = user.roles.map(({ role }) => role.code);
    const accountType = roleCodes.includes("level_one_agent")
      ? "AGENT"
      : roleCodes.length > 0 ? "ADMIN" : "USER";
    const rolePermissions = user.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.code),
    );
    // 代理权限不写入可配置角色表，避免管理员误配后扩大代理权限。
    // agent:readonly 同时供前端识别只读模式；真正的数据范围仍由后端查询强制限制。
    const agentReadPermissions = accountType === "AGENT"
      ? ["agent:readonly", "dashboard:read", "user:read", "agent:reward:read"]
      : [];
    req.auth = {
      userId: user.id,
      // 代理使用固定白名单，忽略角色表中可能存在的历史权限，保证只能访问限定查询。
      permissions: [...new Set(accountType === "AGENT" ? agentReadPermissions : rolePermissions)],
      roleCodes,
      accountType,
    };
    next();
  } catch {
    throw new AppError(401, 2002, "登录已过期，请重新登录");
  }
};

/**
 * 代理后台是审计型只读后台：即使未来角色权限被误配置，仍禁止所有写请求。
 * 此中间件应放在后台认证和 access-codes 接口之后、具体业务路由之前。
 */
export const denyAgentWrites = (req: Request, _res: Response, next: NextFunction) => {
  if (req.auth?.accountType === "AGENT" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    throw new AppError(403, 2013, "代理后台仅支持查看，不允许修改数据");
  }
  next();
};

/** 要求当前用户同时拥有传入的全部权限；`*` 是预留的超级权限。 */
export const permit =
  (...required: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const owned = req.auth?.permissions ?? [];
    if (!required.every((code) => owned.includes("*") || owned.includes(code)))
      throw new AppError(403, 2003, "无权执行此操作");
    next();
  };

/** 至少拥有一个权限码即可访问，适用于管理员权限与代理专用只读权限共用的查询接口。 */
export const permitAny =
  (...accepted: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const owned = req.auth?.permissions ?? [];
    if (!owned.includes("*") && !accepted.some((code) => owned.includes(code))) {
      throw new AppError(403, 2003, "无权执行此操作");
    }
    next();
  };

/**
 * 高风险后台操作要求再次提交当前密码。
 * 密码只从请求头读取并即时比较，不写入日志、数据库或业务请求体。
 */
export const verifySecondaryPassword = async (req: Request, _res: Response, next: NextFunction) => {
  const password = req.header("x-confirm-password");
  if (!password) throw new AppError(428, 2010, "请输入当前登录密码进行二次验证");
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(403, 2011, "二次验证密码错误");
  }
  next();
};
