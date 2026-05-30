export interface UserSession {
  step?: string;
  selectedSol?: number;
  contractAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  paymentWallet?: string;
  paymentAmount?: number;
  paymentDeadline?: number;
  boostType?: string;
  boostPackage?: string;
}

const sessions = new Map<number, UserSession>();

export function getSession(userId: number): UserSession {
  if (!sessions.has(userId)) {
    sessions.set(userId, {});
  }
  return sessions.get(userId)!;
}

export function setSession(userId: number, data: Partial<UserSession>) {
  const current = getSession(userId);
  sessions.set(userId, { ...current, ...data });
}

export function clearSession(userId: number) {
  sessions.set(userId, {});
}
