import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';
import { productConfig } from '#/config/product.generated';
import { getAccessCodesApi } from './auth';

const brandName = productConfig.brand.appDisplayName;

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  // Vben 的页面路由读取 roles，而按钮读取 accessCodes。两者统一使用后端权限码，
  // 确保菜单、页面、按钮和 Express 接口采用同一套授权语义。
  const [profile, permissions] = await Promise.all([
    requestClient.get<{
      avatarUrl?: null | string;
      id: string;
      nickname: string;
      phone: string;
    }>('/auth/me'),
    getAccessCodesApi(),
  ]);

  // 将业务用户模型适配为 Vben 布局使用的标准用户结构。
  return {
    avatar: profile.avatarUrl || '',
    desc: permissions.includes('agent:readonly') ? `${brandName}代理（只读）` : `${brandName}管理员`,
    homePath: '/dashboard/overview',
    id: profile.id,
    realName: profile.nickname,
    roles: permissions,
    token: '',
    userId: profile.id,
    username: profile.phone,
  } satisfies UserInfo;
}
