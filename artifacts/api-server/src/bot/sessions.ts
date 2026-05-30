export interface UserSession {
  step?: string;
  selectedSol?: number;
  ethAmount?: number;
  contractAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  paymentWallet?: string;
  orderId?: string;
  serviceLabel?: string;
  boostType?: string;
  boostPackage?: string;
}

const sessions = new Map<number, UserSession>();

export function getSession(userId: number): UserSession {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId)!;
}

export function setSession(userId: number, data: Partial<UserSession>) {
  sessions.set(userId, { ...getSession(userId), ...data });
}

export function clearSession(userId: number) {
  sessions.set(userId, {});
}
