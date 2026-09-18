import assert from "node:assert/strict";
import test from "node:test";
import { playbackValidationSchema } from "./content.schema.js";

test("真机播放验证接受请求成功和实际开播事件", () => {
  for (const eventType of ["REQUEST_SUCCEEDED", "PLAYBACK_STARTED"] as const) {
    const result = playbackValidationSchema.safeParse({
      externalId: "38061",
      eventType,
      episodeIndex: 1,
      deviceModel: "PBEM00",
      abi: "arm64-v8a",
      sdkVersion: "3.0.0.2",
    });
    assert.equal(result.success, true);
  }
});

test("真机播放验证拒绝零基集数和非数字内容 ID", () => {
  assert.equal(playbackValidationSchema.safeParse({
    externalId: "local-id",
    eventType: "PLAYBACK_STARTED",
    episodeIndex: 0,
  }).success, false);
});
