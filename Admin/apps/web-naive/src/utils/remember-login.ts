import { createSecureStorage } from '@vben/stores';
import { productConfig } from '#/config/product.generated';

const STORAGE_KEY = 'admin-login-credentials';
const ACCOUNT_KEY = `REMEMBER_ME_USERNAME_${location.hostname}`;
const storage = createSecureStorage(
  `${productConfig.admin.namespace}-login-credentials-meta`,
);

export interface RememberedLogin {
  password: string;
  phone: string;
}

export function getRememberedLogin(): null | RememberedLogin {
  try {
    const value = storage.get(STORAGE_KEY) as null | Partial<RememberedLogin>;
    return value?.phone && value.password
      ? { phone: value.phone, password: value.password }
      : null;
  } catch {
    clearRememberedLogin();
    return null;
  }
}

export function saveRememberedLogin(value: RememberedLogin) {
  storage.set(STORAGE_KEY, value);
}

export function clearRememberedLogin() {
  storage.remove(STORAGE_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}
