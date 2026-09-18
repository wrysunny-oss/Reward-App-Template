import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { runReconciliation } from "../modules/reconciliation/reconciliation.service.js";

/** 供 Windows 任务计划或 CI 定时调用；差异或运行错误均以非零退出码告警。 */
try {
  const result = await runReconciliation();
  console.log(JSON.stringify({ runId: result.id, status: result.status, checkedUsers: result.checkedUsers, issueCount: result.issueCount }));
  process.exitCode = result.status === "PASSED" ? 0 : 2;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
