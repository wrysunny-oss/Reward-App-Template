import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
// 权限码是 API 与中后台前端之间的稳定契约，发布后应避免随意改名。
const permissions = [
  ["dashboard:read", "查看工作台", "dashboard"], ["user:read", "查看用户", "user"],
  ["user:update", "编辑用户", "user"], ["content:read", "查看内容", "content"],
  ["content:create", "创建内容", "content"], ["content:update", "编辑内容", "content"],
  ["content:delete", "删除内容", "content"], ["feedback:read", "查看反馈", "feedback"],
  ["feedback:update", "处理反馈", "feedback"], ["rbac:read", "查看权限", "system"],
  ["rbac:update", "配置权限", "system"], ["audit:read", "查看审计日志", "system"],
  ["coin:read", "查看金币流水", "finance"], ["coin:adjust", "人工调整金币", "finance"],
  ["admin:read", "查看管理员", "system"], ["admin:update", "管理管理员", "system"],
  ["reward:read", "查看奖励运营数据", "reward"], ["reward:update", "配置奖励规则", "reward"],
  ["withdrawal:read", "查看提现订单", "finance"], ["withdrawal:review", "审核与确认提现", "finance"],
  ["withdrawal:config", "配置提现规则", "finance"],
  ["withdrawal:batch:read", "查看提现批次", "finance"],
  ["withdrawal:batch:manage", "创建批次和确认打款结果", "finance"],
  ["withdrawal:batch:export", "导出完整收款信息", "finance"],
  ["operation:read", "查看运营配置", "operation"], ["operation:update", "管理运营配置", "operation"],
  ["upload:create", "上传运营素材", "operation"],
  ["report:read", "查看举报", "safety"], ["report:update", "处理举报", "safety"],
  ["risk:read", "查看风险事件", "risk"], ["risk:update", "处理风险与用户限制", "risk"],
  ["reconciliation:read", "查看资金对账", "finance"], ["reconciliation:run", "执行资金对账", "finance"],
] as const;

const rewardRules = [
  ["GOLDEN_WATCH", "黄金时段观剧", 15n, "在配置时段内累计有效观看达到要求后，每日发放一次"],
  ["REGISTER", "新用户注册奖励", 100n, "注册成功后发放一次"],
  ["INVITE_DIRECT", "直接邀请奖励", 200n, "受邀用户首次绑定后发放给直接邀请人"],
  ["INVITE_INDIRECT", "间接邀请奖励", 50n, "二级邀请关系建立后发放给上级邀请人"],
  ["SIGNIN_DAY_1", "连续签到第 1 天", 10n, "7 天为一个奖励周期"],
  ["SIGNIN_DAY_2", "连续签到第 2 天", 15n, "7 天为一个奖励周期"],
  ["SIGNIN_DAY_3", "连续签到第 3 天", 20n, "7 天为一个奖励周期"],
  ["SIGNIN_DAY_4", "连续签到第 4 天", 25n, "7 天为一个奖励周期"],
  ["SIGNIN_DAY_5", "连续签到第 5 天", 30n, "7 天为一个奖励周期"],
  ["SIGNIN_DAY_6", "连续签到第 6 天", 40n, "7 天为一个奖励周期"],
  ["SIGNIN_DAY_7", "连续签到第 7 天", 60n, "7 天为一个奖励周期"],
] as const;

async function main() {
  // 全部使用 upsert/createMany + skipDuplicates，使初始化脚本可以安全重复执行。
  for (const [code, name, module] of permissions) await prisma.permission.upsert({ where: { code }, create: { code, name, module }, update: { name, module } });
  for (const [code, name, amount, description] of rewardRules) {
    await prisma.rewardRule.upsert({ where: { code }, create: { code, name, amount, description }, update: { name, description } });
  }
  await prisma.withdrawalConfig.upsert({
    where: { id: 1 },
    create: { id: 1, tiers: ['10000', '50000', '100000', '500000', '1000000'] },
    update: {},
  });
  const defaultConfigs = [
    ["reward.golden_watch", { enabled: true, requiredSeconds: 300, heartbeatSeconds: 15, periods: [{ start: "12:00", end: "14:00" }, { start: "18:00", end: "22:00" }] }, "黄金时段观剧任务配置，按北京时间生效"],
    ["app.feature_flags", { signIn: true, withdrawal: true, ads: false, maintenance: false }, "App 功能开关"],
    ["app.basic", { coinName: "金币", customerService: "", defaultAvatar: "", inviteShareText: "邀请好友一起看短剧" }, "App 基础运营参数"],
    ["finance.reconciliation_schedule", { enabled: true, hour: 3, minute: 0, timezone: "Asia/Shanghai" }, "资金自动对账时间；修改后无需重启服务"],
  ] as const;
  for (const [key, value, description] of defaultConfigs) {
    await prisma.systemConfig.upsert({ where: { key }, create: { key, value, description }, update: {} });
  }
  const role = await prisma.role.upsert({ where: { code: "super_admin" }, create: { code: "super_admin", name: "超级管理员", isSystem: true }, update: {} });
  const all = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({ data: all.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
  const password = process.env.ADMIN_INITIAL_PASSWORD || "123456";
  const passwordHash = await bcrypt.hash(password, 12);
  const currentAdmin = await prisma.user.findUnique({ where: { phone: "admin" } });
  const legacyAdmin = await prisma.user.findUnique({ where: { phone: "13800000000" } });
  // 首次执行时创建 admin；已有旧版管理员时直接迁移，避免保留旧登录入口。
  const admin = currentAdmin
    ? await prisma.user.update({ where: { id: currentAdmin.id }, data: { passwordHash, status: "ACTIVE" } })
    : legacyAdmin
      ? await prisma.user.update({ where: { id: legacyAdmin.id }, data: { phone: "admin", passwordHash, status: "ACTIVE" } })
      : await prisma.user.create({ data: { phone: "admin", nickname: "系统管理员", passwordHash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: admin.id, roleId: role.id } }, create: { userId: admin.id, roleId: role.id }, update: {} });
  console.log("Seed completed. Admin account: admin");
}

main().finally(() => prisma.$disconnect());
