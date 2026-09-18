import type { RouteRecordRaw } from 'vue-router';

import { productModules } from '#/config/product.generated';

const rewardChildren: RouteRecordRaw[] = [
  ...(productModules.rewards ? [
    { name: 'RewardRules', path: 'rules', component: () => import('#/views/operations/rewards/rules.vue'), meta: { authority: ['reward:read'], title: '奖励规则' } },
    { name: 'CheckInRecords', path: 'check-ins', component: () => import('#/views/operations/rewards/check-ins.vue'), meta: { authority: ['reward:read'], title: '签到记录' } },
  ] : []),
  ...(productModules.rewards && productModules.advertising ? [
    { name: 'AdRewardSettlements', path: 'ad-settlements', component: () => import('#/views/operations/rewards/ad-settlements.vue'), meta: { authority: ['reward:read', 'agent:reward:read'], title: '广告收益' } },
  ] : []),
  ...(productModules.invitations ? [
    { name: 'InviteRelations', path: 'invites', component: () => import('#/views/operations/rewards/invites.vue'), meta: { authority: ['reward:read'], title: '邀请记录' } },
  ] : []),
];

const financeChildren: RouteRecordRaw[] = [
  ...(productModules.rewards ? [
    { name: 'CoinLedgers', path: 'coin-ledgers', component: () => import('#/views/operations/finance/coin-ledgers.vue'), meta: { authority: ['coin:read'], title: '金币流水' } },
  ] : []),
  ...(productModules.withdrawals ? [
    { name: 'WithdrawalOrders', path: 'withdrawals', component: () => import('#/views/operations/finance/withdrawals.vue'), meta: { authority: ['withdrawal:read'], title: '提现审核' } },
    { name: 'WithdrawalConfig', path: 'withdrawal-config', component: () => import('#/views/operations/finance/withdrawal-config.vue'), meta: { authority: ['withdrawal:read'], title: '提现规则' } },
    { name: 'WithdrawalBatches', path: 'withdrawal-batches', component: () => import('#/views/operations/finance/withdrawal-batches.vue'), meta: { authority: ['withdrawal:batch:read'], title: '打款批次' } },
    { name: 'ReconciliationRuns', path: 'reconciliation', component: () => import('#/views/operations/finance/reconciliation.vue'), meta: { authority: ['reconciliation:read'], title: '资金对账' } },
  ] : []),
];

/** 固定路由和按钮统一使用后端权限码。 */
const routes: RouteRecordRaw[] = [
  {
    name: 'Profile', path: '/profile',
    component: () => import('#/views/_core/profile/index.vue'),
    meta: { hideInMenu: true, icon: 'lucide:key-round', title: '修改密码' },
  },
  {
    name: 'Dashboard', path: '/dashboard', redirect: '/dashboard/overview',
    meta: { authority: ['dashboard:read'], icon: 'lucide:layout-dashboard', order: 0, title: '运营概览' },
    children: [{
      name: 'DashboardOverview', path: 'overview',
      component: () => import('#/views/operations/dashboard/index.vue'),
      meta: { affixTab: true, authority: ['dashboard:read'], title: '数据看板' },
    }],
  },
  {
    name: 'UserManagement', path: '/users', redirect: '/users/list',
    meta: { authority: ['user:read'], icon: 'lucide:users', order: 10, title: '用户管理' },
    children: [
      { name: 'UserList', path: 'list', component: () => import('#/views/operations/users/index.vue'), meta: { authority: ['user:read'], title: '用户列表' } },
      { name: 'UserDetail', path: ':id', component: () => import('#/views/operations/users/detail.vue'), meta: { authority: ['user:read'], hideInMenu: true, title: '用户详情' } },
    ],
  },
  ...(rewardChildren.length ? [{
    name: 'RewardManagement', path: '/rewards',
    meta: { authority: ['reward:read', 'agent:reward:read'], icon: 'lucide:gift', order: 15, title: '奖励运营' },
    redirect: `/rewards/${String(rewardChildren[0]?.path)}`,
    children: rewardChildren,
  }] : []),
  ...(financeChildren.length ? [{
    name: 'FinanceManagement', path: '/finance',
    meta: { authority: ['coin:read', 'withdrawal:read', 'withdrawal:batch:read', 'reconciliation:read'], icon: 'lucide:coins', order: 20, title: '资金管理' },
    redirect: `/finance/${String(financeChildren[0]?.path)}`,
    children: financeChildren,
  }] : []),
  {
    name: 'OperationCenter', path: '/operations', redirect: '/operations/slots',
    meta: { authority: ['operation:read'], icon: 'lucide:panels-top-left', order: 30, title: '运营配置' },
    children: [
      ...(productModules.shortDrama ? [{ name: 'ContentCenter', path: 'content', component: () => import('#/views/operations/content/index.vue'), meta: { authority: ['operation:read'], title: '短剧内容中心' } }] : []),
      { name: 'OperationSlots', path: 'slots', component: () => import('#/views/operations/config/slots.vue'), meta: { authority: ['operation:read'], title: '首页与弹窗' } },
      { name: 'Announcements', path: 'announcements', component: () => import('#/views/operations/config/announcements.vue'), meta: { authority: ['operation:read'], title: '公告管理' } },
      { name: 'SystemConfigs', path: 'system-configs', component: () => import('#/views/operations/config/system-configs.vue'), meta: { authority: ['operation:read'], title: '参数与开关' } },
      { name: 'AppDocuments', path: 'documents', component: () => import('#/views/operations/config/documents.vue'), meta: { authority: ['operation:read'], title: '协议与关于' } },
      { name: 'AppVersions', path: 'versions', component: () => import('#/views/operations/config/versions.vue'), meta: { authority: ['operation:read'], title: 'App 版本' } },
    ],
  },
  {
    name: 'SafetyCenter', path: '/safety', redirect: '/safety/center',
    meta: { authority: ['feedback:read', 'report:read', 'risk:read'], icon: 'lucide:shield-alert', order: 40, title: '反馈与风控' },
    children: [{ name: 'SafetyCenterPage', path: 'center', component: () => import('#/views/operations/safety/index.vue'), meta: { authority: ['feedback:read','report:read','risk:read'], title: '处置中心' } }],
  },
  {
    name: 'SystemManagement', path: '/system', redirect: '/system/roles',
    meta: { authority: ['rbac:read', 'admin:read', 'audit:read'], icon: 'lucide:settings', order: 90, title: '系统管理' },
    children: [
      { name: 'RoleManagement', path: 'roles', component: () => import('#/views/operations/system/roles.vue'), meta: { authority: ['rbac:read'], title: '角色权限' } },
      { name: 'AdministratorManagement', path: 'administrators', component: () => import('#/views/operations/system/administrators.vue'), meta: { authority: ['admin:read'], title: '管理员' } },
      { name: 'AuditLogs', path: 'audit-logs', component: () => import('#/views/operations/audit/index.vue'), meta: { authority: ['audit:read'], title: '操作日志' } },
      ...(!import.meta.env.PROD
        ? [{ name: 'ApiDocumentation', path: 'api-docs', component: () => import('#/views/operations/system/api-docs.vue'), meta: { authority: ['rbac:read'], icon: 'lucide:file-code-2', title: '接口文档' } }]
        : []),
    ],
  },
];

export default routes;
