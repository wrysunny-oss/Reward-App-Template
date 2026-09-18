export type ApiNetworkStatus = 'offline' | 'online';

let status: ApiNetworkStatus = 'online';
const listeners = new Set<() => void>();

export function getApiNetworkStatus() {
  return status;
}

export function subscribeApiNetworkStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setApiNetworkStatus(next: ApiNetworkStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach(listener => listener());
}
