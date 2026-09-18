import assert from "node:assert/strict";
import test from "node:test";
import { alipayOutBizNo, classifyAlipayStatus, getAlipayTransferScene } from "./alipay-payout.service.js";

test("支付宝商户单号由提现 ID 稳定派生", () => {
  const id = "3f679d97-9204-4c2d-9919-d7e2ea22c331";
  assert.equal(alipayOutBizNo(id), "HLW3f679d9792044c2d9919d7e2ea22c331");
  assert.equal(alipayOutBizNo(id), alipayOutBizNo(id));
});

test("支付宝结果只把明确终态归类为成功或失败", () => {
  assert.equal(classifyAlipayStatus("SUCCESS"), "SUCCESS");
  assert.equal(classifyAlipayStatus("FAIL"), "FAILED");
  assert.equal(classifyAlipayStatus("REFUND"), "FAILED");
  assert.equal(classifyAlipayStatus("DEALING"), "PROCESSING");
  assert.equal(classifyAlipayStatus(undefined), "PROCESSING");
});

test("支付宝转账携带已申报的转账场景和场景说明", () => {
  const scene = getAlipayTransferScene();
  assert.equal(scene.transfer_scene_name, "现金营销");
  assert.deepEqual(scene.transfer_scene_report_infos.map((item) => item.info_type), ["活动名称", "奖励说明"]);
  assert.ok(scene.transfer_scene_report_infos.every((item) => item.info_content.length > 0));
});
