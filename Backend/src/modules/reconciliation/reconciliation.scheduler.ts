import { Prisma } from "@prisma/client";
import { getSchedule, runReconciliation } from "./reconciliation.service.js";

/** 使用指定时区生成当天调度键，不依赖服务器所在操作系统的时区。 */
function localParts(date: Date, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, item.value]),
  );
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

/**
 * 每分钟检查一次是否到达执行时间。
 * scheduleKey 唯一索引是最终并发屏障，即使多实例同时命中也只有一个任务会创建成功。
 */
export async function checkScheduledReconciliation(now = new Date()) {
  const config = await getSchedule();
  if (!config.enabled || config.hour < 0 || config.hour > 23 || config.minute < 0 || config.minute > 59) return;
  const current = localParts(now, config.timezone);
  if (current.hour !== config.hour || current.minute !== config.minute) return;
  try {
    await runReconciliation({
      source: "SCHEDULED",
      scheduleKey: `daily:${current.dateKey}`,
    });
  } catch (error) {
    // P2002 表示另一个实例已经创建当天任务，属于预期的幂等结果。
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    console.error("Scheduled reconciliation failed", error);
  }
}

/** 启动轻量调度器；unref 避免它阻止 Node.js 正常退出。 */
export function startReconciliationScheduler() {
  void checkScheduledReconciliation();
  const timer = setInterval(() => void checkScheduledReconciliation(), 60_000);
  timer.unref();
  return timer;
}
