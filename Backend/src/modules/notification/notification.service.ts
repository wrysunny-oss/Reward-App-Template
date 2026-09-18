import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { AppError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import type { SendNotificationInput } from "./notification.schema.js";

type Tx = Prisma.TransactionClient;
type AuditRequest = Pick<Request, "method" | "path" | "ip" | "header">;

/** 业务状态变化与资金事务共用同一事务，避免业务成功但通知丢失。 */
export async function createUserNotification(tx: Tx, userId: bigint, input: { content: string; title: string; type: string }) {
  const notification = await tx.notification.create({ data: input });
  await tx.userNotification.create({ data: { notificationId: notification.id, userId } });
  return notification;
}

export async function listMine(userId: bigint) {
  const [links, total, unread] = await prisma.$transaction([
    prisma.userNotification.findMany({
      where: { userId },
      include: { notification: true },
      orderBy: { notification: { createdAt: "desc" } },
      take: 100,
    }),
    prisma.userNotification.count({ where: { userId } }),
    prisma.userNotification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    list: links.map((item) => ({ ...item.notification, readAt: item.readAt })),
    total,
    unread,
  };
}

export const unreadCount = (userId: bigint) => prisma.userNotification.count({ where: { userId, readAt: null } });

export async function markRead(userId: bigint, notificationId: bigint) {
  const changed = await prisma.userNotification.updateMany({
    where: { userId, notificationId, readAt: null },
    data: { readAt: new Date() },
  });
  if (changed.count === 0) {
    const exists = await prisma.userNotification.count({ where: { userId, notificationId } });
    if (!exists) throw new AppError(404, 3601, "通知不存在");
  }
  return { notificationId, read: true };
}

export async function markAllRead(userId: bigint) {
  const result = await prisma.userNotification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { updated: result.count };
}

/** 后台支持全量或按手机号定向发送，并记录完整审计信息。 */
export function sendFromAdmin(operatorId: bigint, input: SendNotificationInput, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    const notification = await tx.notification.create({ data: { title: input.title, content: input.content, type: input.type } });
    let recipients: bigint[];
    if (input.target === "USER") {
      const user = await tx.user.findUnique({ where: { phone: input.phone! }, select: { id: true } });
      if (!user) throw new AppError(404, 3602, "未找到该手机号对应的用户");
      recipients = [user.id];
    } else {
      recipients = (await tx.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } })).map((user) => user.id);
    }
    for (let offset = 0; offset < recipients.length; offset += 1000) {
      const batch = recipients.slice(offset, offset + 1000);
      await tx.userNotification.createMany({ data: batch.map((userId) => ({ userId, notificationId: notification.id })) });
    }
    await tx.auditLog.create({ data: {
      operatorId,
      action: "notification.send",
      method: request.method,
      path: request.path,
      targetType: "notification",
      targetId: notification.id.toString(),
      ip: request.ip,
      userAgent: request.header("user-agent"),
      detail: { target: input.target, phone: input.phone, type: input.type, recipients: recipients.length },
    } });
    return { ...notification, recipients: recipients.length };
  });
}
