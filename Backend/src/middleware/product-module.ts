import type { RequestHandler } from "express";
import { productModules, type ProductModuleKey, type ProductModules } from "../generated/product.generated.js";
import { AppError } from "../lib/http.js";

export function areProductModulesEnabled(modules: ProductModuleKey[], enabled: ProductModules = productModules) {
  return modules.every((module) => enabled[module]);
}

/** 服务端是模块开关的最终安全边界；关闭后的能力按不存在处理，避免绕过前端入口直接调用。 */
export function requireProductModules(...modules: ProductModuleKey[]): RequestHandler {
  return (_req, _res, next) => {
    if (areProductModulesEnabled(modules)) return next();
    return next(new AppError(404, 1004, "接口不存在"));
  };
}
