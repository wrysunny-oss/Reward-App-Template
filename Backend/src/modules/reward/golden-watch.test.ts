import assert from "node:assert/strict";
import test from "node:test";
import { calculateGoldenWatchDelta, isGoldenWatchActive, parseGoldenWatchConfig } from "./golden-watch.js";

const config = parseGoldenWatchConfig({
  enabled: true,
  requiredSeconds: 300,
  heartbeatSeconds: 15,
  periods: [{start: "12:00", end: "14:00"}, {start: "18:00", end: "22:00"}],
});

test("黄金时段按北京时间判断且结束时间不包含在区间内", () => {
  assert.equal(isGoldenWatchActive(config, new Date("2026-09-14T04:30:00.000Z")), true);
  assert.equal(isGoldenWatchActive(config, new Date("2026-09-14T06:00:00.000Z")), false);
});

test("同一会话只累计递增秒数并限制单次心跳上限", () => {
  assert.equal(calculateGoldenWatchDelta({sessionId: "a", previousSessionId: "a", previousSessionSeconds: 15, elapsedSeconds: 30, heartbeatSeconds: 15}), 15);
  assert.equal(calculateGoldenWatchDelta({sessionId: "a", previousSessionId: "a", previousSessionSeconds: 30, elapsedSeconds: 30, heartbeatSeconds: 15}), 0);
  assert.equal(calculateGoldenWatchDelta({sessionId: "a", previousSessionId: "a", previousSessionSeconds: 30, elapsedSeconds: 100, heartbeatSeconds: 15}), 20);
});

test("短时间切换会话不重复累计首个心跳", () => {
  const now = new Date("2026-09-14T04:30:30.000Z");
  assert.equal(calculateGoldenWatchDelta({sessionId: "b", previousSessionId: "a", elapsedSeconds: 15, heartbeatSeconds: 15, previousHeartbeatAt: new Date("2026-09-14T04:30:20.000Z"), now}), 0);
});
