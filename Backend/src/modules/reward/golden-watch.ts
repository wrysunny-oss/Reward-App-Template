import { z } from "zod";

export const GOLDEN_WATCH_CONFIG_KEY = "reward.golden_watch";
export const GOLDEN_WATCH_RULE_CODE = "GOLDEN_WATCH";
export const GOLDEN_WATCH_TIME_ZONE = "Asia/Shanghai";

const periodSchema = z.object({
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
}).refine(period => period.start < period.end, "结束时间必须晚于开始时间");

export const goldenWatchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  requiredSeconds: z.number().int().min(60).max(24 * 60 * 60).default(300),
  heartbeatSeconds: z.number().int().min(5).max(60).default(15),
  periods: z.array(periodSchema).min(1).max(6).default([
    { start: "12:00", end: "14:00" },
    { start: "18:00", end: "22:00" },
  ]),
});

export type GoldenWatchConfig = z.infer<typeof goldenWatchConfigSchema>;

export const DEFAULT_GOLDEN_WATCH_CONFIG: GoldenWatchConfig = {
  enabled: true,
  requiredSeconds: 300,
  heartbeatSeconds: 15,
  periods: [{ start: "12:00", end: "14:00" }, { start: "18:00", end: "22:00" }],
};

export function parseGoldenWatchConfig(value: unknown): GoldenWatchConfig {
  const parsed = goldenWatchConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GOLDEN_WATCH_CONFIG;
}

function minuteOfDay(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function chinaDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GOLDEN_WATCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function chinaDate(now = new Date(), offsetDays = 0) {
  const date = new Date(`${chinaDay(now)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

export function chinaMinuteOfDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: GOLDEN_WATCH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find(part => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isGoldenWatchActive(config: GoldenWatchConfig, now = new Date()) {
  const current = chinaMinuteOfDay(now);
  return config.enabled && config.periods.some(period => (
    current >= minuteOfDay(period.start) && current < minuteOfDay(period.end)
  ));
}

export function calculateGoldenWatchDelta(input: {
  elapsedSeconds: number;
  previousSessionId?: string | null;
  previousSessionSeconds?: number;
  previousHeartbeatAt?: Date | null;
  sessionId: string;
  heartbeatSeconds: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const cap = input.heartbeatSeconds + 5;
  if (input.previousSessionId === input.sessionId) {
    return Math.max(0, Math.min(cap, input.elapsedSeconds - (input.previousSessionSeconds ?? 0)));
  }
  if (input.previousHeartbeatAt && now.getTime() - input.previousHeartbeatAt.getTime() < input.heartbeatSeconds * 2_000) {
    return 0;
  }
  return Math.max(0, Math.min(cap, input.elapsedSeconds));
}
