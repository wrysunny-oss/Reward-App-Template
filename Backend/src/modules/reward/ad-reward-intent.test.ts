import assert from "node:assert/strict";
import test from "node:test";
import { createDramaUnlockIntent, verifyDramaUnlockIntent } from "./ad-reward-intent.js";

test("短剧解锁广告意图只能由服务端签发且绑定用户和剧集", () => {
  const token = createDramaUnlockIntent(12n, "38061", 11);
  const verified = verifyDramaUnlockIntent(token, 12n);
  assert.equal(verified?.dramaId, "38061");
  assert.equal(verified?.episodeIndex, 11);
  assert.equal(verifyDramaUnlockIntent(token, 13n), null);
  assert.equal(verifyDramaUnlockIntent(`${token}x`, 12n), null);
});
