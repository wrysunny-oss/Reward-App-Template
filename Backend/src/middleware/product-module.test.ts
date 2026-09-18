import assert from "node:assert/strict";
import test from "node:test";
import { productModules, type ProductModules } from "../generated/product.generated.js";
import { areProductModulesEnabled } from "./product-module.js";

test("产品模块守卫要求声明的模块全部启用", () => {
  assert.equal(areProductModulesEnabled(["advertising", "rewards"]), true);
  const disabledRewards: ProductModules = { ...productModules, rewards: false };
  assert.equal(areProductModulesEnabled(["advertising", "rewards"], disabledRewards), false);
  assert.equal(areProductModulesEnabled(["advertising"], disabledRewards), true);
});
