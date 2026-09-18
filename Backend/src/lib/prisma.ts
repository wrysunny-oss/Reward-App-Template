import { PrismaClient } from "@prisma/client";

// 开发热更新时复用连接池，避免重复实例耗尽 MySQL 连接数。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
