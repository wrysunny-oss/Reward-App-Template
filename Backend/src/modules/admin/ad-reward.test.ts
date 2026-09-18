import test from "node:test";
import assert from "node:assert/strict";
import { calculateAdDistribution, calculateAgentCommission, normalizeRewardMilestones, usesDailyRewardedAdLimit } from "./admin.service.js";
import { updateAdRewardConfigSchema } from "./admin.schema.js";

test("全局广告配置要求合法的每日次数上限", () => {
  const valid = { defaultShareRateBps: 5000, directShareRateBps: 1000, indirectShareRateBps: 500, dailyRewardedAdLimit: 5, splashRewardEnabled: false, feedRewardEnabled: false, fullScreenRewardEnabled: false, rewardedVideoRewardEnabled: true, contentUnlockRewardEnabled: true, rewardedAdMilestones: [{ count: 5, rewardCoins: 100, period: "DAILY" as const }], inviteMilestones: [{ count: 10, rewardCoins: 500, period: "LIFETIME" as const }] };
  assert.equal(updateAdRewardConfigSchema.safeParse(valid).success, true);
  assert.equal(updateAdRewardConfigSchema.safeParse({ ...valid, dailyRewardedAdLimit: -1 }).success, false);
  assert.equal(updateAdRewardConfigSchema.safeParse({ ...valid, dailyRewardedAdLimit: 1.5 }).success, false);
  assert.equal(updateAdRewardConfigSchema.safeParse({ ...valid, dailyRewardedAdLimit: 4 }).success, false);
  assert.equal(updateAdRewardConfigSchema.safeParse({ ...valid, rewardedAdMilestones: [...valid.rewardedAdMilestones, ...valid.rewardedAdMilestones] }).success, false);
});

test("阶梯任务支持每日和永久周期并过滤非法配置", () => {
  assert.deepEqual(normalizeRewardMilestones([
    { count: 10, rewardCoins: 500, period: "LIFETIME" },
    { count: 5, rewardCoins: 100, period: "DAILY" },
    { count: 0, rewardCoins: 100, period: "DAILY" },
  ]), [
    { count: 5, rewardCoins: 100, period: "DAILY" },
    { count: 10, rewardCoins: 500, period: "LIFETIME" },
  ]);
});

test("任务激励与短剧解锁共用每日收益次数限制", () => {
  assert.equal(usesDailyRewardedAdLimit("REWARD"), true);
  assert.equal(usesDailyRewardedAdLimit("CONTENT_UNLOCK"), true);
  assert.equal(usesDailyRewardedAdLimit("SPLASH"), false);
  assert.equal(usesDailyRewardedAdLimit("FEED"), false);
  assert.equal(usesDailyRewardedAdLimit("FULL_SCREEN"), false);
});

test("无上级时用户获得全部基础应分金币", () => {
  assert.deepEqual(calculateAdDistribution({ revenueMicros: 10_000n, coinsPerCent: 100, userRateBps: 5000, directRateBps: 2000, indirectRateBps: 1000, hasDirect: false, hasIndirect: false }), { baseUserCoins: 50n, awardedCoins: 50n, directAwardedCoins: 0n, indirectAwardedCoins: 0n });
});
test("存在两级上级时用户收益不扣减且返佣由平台额外支付", () => {
  const result = calculateAdDistribution({ revenueMicros: 1_000_000n, coinsPerCent: 100, userRateBps: 5000, directRateBps: 2000, indirectRateBps: 1000, hasDirect: true, hasIndirect: true });
  assert.deepEqual(result, { baseUserCoins: 5000n, awardedCoins: 5000n, directAwardedCoins: 1000n, indirectAwardedCoins: 500n });
  assert.equal(result.awardedCoins, result.baseUserCoins);
  assert.equal(result.awardedCoins + result.directAwardedCoins + result.indirectAwardedCoins, 6500n);
});
test("只有直属上级时用户仍获得完整基础收益", () => {
  assert.deepEqual(calculateAdDistribution({ revenueMicros: 1_000_000n, coinsPerCent: 100, userRateBps: 5000, directRateBps: 2000, indirectRateBps: 1000, hasDirect: true, hasIndirect: false }), { baseUserCoins: 5000n, awardedCoins: 5000n, directAwardedCoins: 1000n, indirectAwardedCoins: 0n });
});
test("小额收益始终向下取整且不会超发", () => {
  const result = calculateAdDistribution({ revenueMicros: 1n, coinsPerCent: 100, userRateBps: 5000, directRateBps: 2000, indirectRateBps: 1000, hasDirect: true, hasIndirect: true });
  assert.equal(result.baseUserCoins, 0n); assert.equal(result.awardedCoins, 0n);
});
test("代理无限下级佣金由平台按代理独立比例额外支付", () => {
  assert.equal(calculateAgentCommission(5000n, 800), 400n);
  assert.equal(calculateAgentCommission(1n, 800), 0n);
});
