import test from "node:test";
import assert from "node:assert/strict";
import { constants, createHash, generateKeyPairSync, publicEncrypt } from "node:crypto";
import { groMoreEcpmToRevenueYuan, verifyGroMoreSign } from "./webhook.service.js";
import { matchesGroMoreEcpmPlaintext, verifyGroMoreEncryptedEcpm } from "../reward/reward.service.js";

test("GroMore m-key 与交易号签名校验", () => {
  const key = "test-gromore-security-key";
  const transId = "transaction-001";
  const sign = createHash("sha256").update(`${key}:${transId}`).digest("hex");
  assert.equal(verifyGroMoreSign(transId, sign, key), true);
  assert.equal(verifyGroMoreSign("tampered", sign, key), false);
});

test("GroMore eCPM 从分每千次换算为单次人民币收入", () => {
  assert.equal(groMoreEcpmToRevenueYuan("100"), "0.001000");
  assert.equal(groMoreEcpmToRevenueYuan("123.45"), "0.001234");
  assert.equal(groMoreEcpmToRevenueYuan("0"), "0.000000");
});

test("GroMore 非激励广告加密 eCPM 能验真且拒绝篡改价格", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const input = {
    format: "SPLASH" as const,
    placementId: "104516017",
    slotId: "104516017",
    requestId: "request-verified-001",
    ecpm: "123.45",
    adnName: "pangle",
  };
  const plaintext = `${input.slotId}${input.ecpm}${input.requestId}`;
  const rsInfo = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(plaintext),
  ).toString("base64");
  assert.equal(matchesGroMoreEcpmPlaintext(plaintext, input), true);
  assert.doesNotThrow(() => verifyGroMoreEncryptedEcpm({ ...input, rsInfo }, privateKey.export({type: "pkcs8", format: "pem"}).toString()));
  assert.throws(() => verifyGroMoreEncryptedEcpm({ ...input, ecpm: "999.99", rsInfo }, privateKey.export({type: "pkcs8", format: "pem"}).toString()));
});
