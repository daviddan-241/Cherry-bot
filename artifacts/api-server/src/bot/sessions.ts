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

const sessions = new Map<number, UserSession & { lastSeen: Date }>();

export function getSession(userId: number): UserSession {
  if (!sessions.has(userId)) sessions.set(userId, { lastSeen: new Date() });
  const s = sessions.get(userId)!;
  s.lastSeen = new Date();
  return s;
}

export function setSession(userId: number, data: Partial<UserSession>) {
  const existing = sessions.get(userId) ?? { lastSeen: new Date() };
  sessions.set(userId, { ...existing, ...data, lastSeen: new Date() });
}

export function clearSession(userId: number) {
  sessions.set(userId, { lastSeen: new Date() });
}

export function getAllSessions(): { userId: number; session: UserSession; lastSeen: Date }[] {
  return [...sessions.entries()].map(([userId, s]) => ({
    userId,
    session: s,
    lastSeen: s.lastSeen,
  }));
}

export function getActiveSessionCount(): number {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  return [...sessions.values()].filter((s) => s.lastSeen.getTime() > fiveMinAgo).length;
}
