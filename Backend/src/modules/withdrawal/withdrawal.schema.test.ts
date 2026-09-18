import assert from "node:assert/strict";
import test from "node:test";
import { batchResultsSchema, completeWithdrawalSchema, createBatchSchema, updateWithdrawalConfigSchema } from "./withdrawal.schema.js";
import { deriveBatchStatus } from "./withdrawal.service.js";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

test("创建批次拒绝重复提现订单", () => {
  assert.equal(createBatchSchema.safeParse({ requestId: "request-001", withdrawalIds: [firstId, firstId] }).success, false);
});
test("成功结果必须携带支付流水号", () => {
  assert.equal(batchResultsSchema.safeParse({ requestId: "result-001", rows: [{ withdrawalId: firstId, success: true }] }).success, false);
  assert.equal(completeWithdrawalSchema.safeParse({ success: true, remark: "确认完成" }).success, false);
  assert.equal(completeWithdrawalSchema.safeParse({ success: true, remark: "确认完成", paymentReference: "pay-1" }).success, true);
});
test("失败结果必须携带失败原因", () => {
  assert.equal(batchResultsSchema.safeParse({ requestId: "result-002", rows: [{ withdrawalId: firstId, success: false }] }).success, false);
});
test("结果文件拒绝重复订单", () => {
  const row = { withdrawalId: firstId, success: true, paymentReference: "pay-1" };
  assert.equal(batchResultsSchema.safeParse({ requestId: "result-003", rows: [row, row] }).success, false);
});
test("批次状态正确区分全部成功和部分失败", () => {
  assert.equal(deriveBatchStatus([{ withdrawalId: firstId, success: true, paymentReference: "pay-1" }, { withdrawalId: secondId, success: true, paymentReference: "pay-2" }]), "COMPLETED");
  assert.equal(deriveBatchStatus([{ withdrawalId: firstId, success: false, failureReason: "账户无效" }]), "PARTIAL");
});

const withdrawalConfig = {
  enabled: true,
  coinsPerCent: 100,
  tiers: ["10000", "50000", "100000"],
  dailyCountLimit: 3,
  dailyCoinLimit: "2000000",
  feeRateBps: 0,
};

test("提现档位自动生成单次最低和最高金币", () => {
  const result = updateWithdrawalConfigSchema.parse(withdrawalConfig);
  assert.equal(result.minCoins, 10000n);
  assert.equal(result.maxCoins, 100000n);
});

test("提现档位拒绝重复、乱序及不符合兑换比例的金额", () => {
  assert.equal(updateWithdrawalConfigSchema.safeParse({...withdrawalConfig, tiers: ["10000", "10000"]}).success, false);
  assert.equal(updateWithdrawalConfigSchema.safeParse({...withdrawalConfig, tiers: ["50000", "10000"]}).success, false);
  assert.equal(updateWithdrawalConfigSchema.safeParse({...withdrawalConfig, tiers: ["10050"]}).success, false);
});
