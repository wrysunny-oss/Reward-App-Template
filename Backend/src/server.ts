import { app } from "./app.js";
import { env } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { startReconciliationScheduler } from "./modules/reconciliation/reconciliation.scheduler.js";
import { scanWithdrawalTimeouts } from "./modules/withdrawal/withdrawal.service.js";

const server = app.listen(env.PORT, () => console.log(`${env.APP_BRAND_NAME} API listening on http://localhost:${env.PORT}`));
const reconciliationTimer = startReconciliationScheduler();
// 启动时及每小时扫描提现超时；风险事件使用订单级规则码去重。
void scanWithdrawalTimeouts().catch((error) => console.error("Withdrawal timeout scan failed", error));
const withdrawalAlertTimer = setInterval(() => void scanWithdrawalTimeouts().catch((error) => console.error("Withdrawal timeout scan failed", error)), 60 * 60_000);
withdrawalAlertTimer.unref();

const shutdown = async () => {
  clearInterval(reconciliationTimer);
  clearInterval(withdrawalAlertTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
