import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/http.js";

/**
 * 查询代理邀请码名下的全部后代用户。
 * 邀请关系是一棵树，递归 CTE 可以覆盖任意深度，而不是只查直推和间推。
 */
export interface AgentDescendantRow {
  depth: number;
  id: bigint;
  parentId: bigint;
}

/** 返回后代 ID、直属上级和相对代理的层级，供成员树和数据范围共同使用。 */
export async function getAgentDescendants(agentId: bigint) {
  const rows = await prisma.$queryRaw<Array<{ depth: bigint | number; id: bigint; parentId: bigint }>>`
    WITH RECURSIVE descendants AS (
      SELECT invitee_id AS id, inviter_id AS parentId, 1 AS depth
      FROM invite_relations
      WHERE inviter_id = ${agentId}
      UNION ALL
      SELECT relation.invitee_id AS id, relation.inviter_id AS parentId, parent.depth + 1 AS depth
      FROM invite_relations relation
      INNER JOIN descendants parent ON relation.inviter_id = parent.id
    )
    SELECT id, parentId, depth FROM descendants
  `;
  // MySQL 驱动对递归表达式可能返回 bigint，这里统一转换为前端可直接使用的 number。
  return rows.map((row) => ({ ...row, depth: Number(row.depth) })) satisfies AgentDescendantRow[];
}

export async function getAgentDescendantIds(agentId: bigint) {
  const rows = await getAgentDescendants(agentId);
  return rows.map((row) => row.id);
}

/** 代理查看单个用户前必须确认该用户属于自己的下级树。 */
export async function assertAgentCanViewUser(agentId: bigint, userId: bigint) {
  const descendantIds = await getAgentDescendantIds(agentId);
  if (!descendantIds.some((id) => id === userId)) {
    throw new AppError(403, 2012, "只能查看自己下级成员的信息");
  }
  return descendantIds;
}
