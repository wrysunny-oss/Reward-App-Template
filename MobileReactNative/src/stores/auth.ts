import { create } from 'zustand';
import { appApi } from '../api/app';
import {
  clearSession,
  getCachedUser,
  hasSession,
  saveCachedUser,
  saveSession,
  setSessionExpiredHandler,
} from '../api/client';
import {isAuthenticationError} from '../api/api-error';
import type { AuthUser } from '../types/api';
import {ensureRiskAssessment} from '../native/risk';
interface State {
  ready: boolean;
  user: AuthUser | null;
  restore(): Promise<void>;
  login(p: string, w: string): Promise<void>;
  register(data: {
    phone: string;
    smsCode: string;
    password: string;
    nickname: string;
    inviteCode?: string;
  }): Promise<void>;
  setUser(user: AuthUser): void;
  logout(): Promise<void>;
}
export const useAuthStore = create<State>(set => ({
  ready: false,
  user: null,
  restore: async () => {
    if (!(await hasSession())) return set({ ready: true, user: null });
    const cachedUser = await getCachedUser();
    try {
      const user = await appApi.me();
      await ensureRiskAssessment('login');
      await saveCachedUser(user);
      set({ user, ready: true });
    } catch (error) {
      if (isAuthenticationError(error)) {
        await clearSession();
        set({ ready: true, user: null });
      } else {
        set({ ready: true, user: cachedUser });
      }
    }
  },
  login: async (p, w) => {
    const r = await appApi.login(p, w);
    await saveSession(r);
    try {
      await ensureRiskAssessment('login');
      set({ user: r.user });
    } catch (error) {
      await clearSession();
      throw error;
    }
  },
  register: async data => {
    const r = await appApi.register(data);
    await saveSession(r);
    try {
      await ensureRiskAssessment('login');
      set({ user: r.user });
    } catch (error) {
      await clearSession();
      throw error;
    }
  },
  setUser: user => {
    set({ user });
    saveCachedUser(user).catch(() => undefined);
  },
  logout: async () => {
    await clearSession();
    set({ user: null });
  },
}));

setSessionExpiredHandler(() => {
  useAuthStore.setState({ready: true, user: null});
});
