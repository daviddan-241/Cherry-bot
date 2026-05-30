export interface Order {
  id: string;
  userId: number;
  userName: string;
  userHandle: string;
  tokenName: string;
  tokenSymbol: string;
  contractAddress: string;
  service: string;
  solAmount: number;
  usdAmount?: number;
  txHash?: string;
  paymentWallet: string;
  status: "pending" | "tx_submitted" | "completed" | "cancelled";
  createdAt: Date;
  txSubmittedAt?: Date;
}

const orders = new Map<string, Order>();
const userOrderIndex = new Map<number, string[]>();

export function saveOrder(order: Order): void {
  orders.set(order.id, order);
  const userOrders = userOrderIndex.get(order.userId) ?? [];
  if (!userOrders.includes(order.id)) {
    userOrders.push(order.id);
    userOrderIndex.set(order.userId, userOrders);
  }
}

export function updateOrder(id: string, patch: Partial<Order>): void {
  const existing = orders.get(id);
  if (existing) orders.set(id, { ...existing, ...patch });
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function getAllOrders(): Order[] {
  return [...orders.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function getOrderStats() {
  const all = getAllOrders();
  return {
    total: all.length,
    pending: all.filter((o) => o.status === "pending").length,
    txSubmitted: all.filter((o) => o.status === "tx_submitted").length,
    completed: all.filter((o) => o.status === "completed").length,
    totalUsers: userOrderIndex.size,
  };
}
