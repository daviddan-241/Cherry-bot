/**
 * Real on-chain transaction verifier.
 * - Solana: validates base58 format + calls mainnet RPC getTransaction
 * - Ethereum: validates 0x+64hex format + calls public ETH RPC
 * - Tracks used hashes to prevent replay attacks
 */

// ── Format regexes ─────────────────────────────────────────────────────────────
const SOL_REGEX = /^[1-9A-HJ-NP-Za-km-z]{85,90}$/;    // Solana base58 signature
const ETH_REGEX = /^0x[0-9a-fA-F]{64}$/;               // Ethereum keccak256 tx hash

// ── Replay-attack protection (in-memory; survives restarts via order store) ───
const usedHashes = new Set<string>();

export function markHashUsed(hash: string) { usedHashes.add(hash.toLowerCase()); }
export function isHashUsed(hash: string) { return usedHashes.has(hash.toLowerCase()); }

// ── Chain detection ────────────────────────────────────────────────────────────
export type Chain = "sol" | "eth" | "invalid";

export function detectChain(raw: string): Chain {
  const h = raw.trim();
  if (ETH_REGEX.test(h)) return "eth";
  if (SOL_REGEX.test(h)) return "sol";
  return "invalid";
}

// ── Result type ────────────────────────────────────────────────────────────────
export interface TxResult {
  ok:        boolean;
  confirmed: boolean;
  chain:     Chain;
  error?:    string;
  lamports?: number;      // SOL: lamports transferred
  recipient?: string;     // SOL/ETH: destination address
  sender?:    string;
}

// ── SOL RPC endpoints (tried in order) ────────────────────────────────────────
const SOL_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.rpc.extrnode.com",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com",
];

async function solRpc(method: string, params: any[], timeoutMs = 8000): Promise<any> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "Content-Type": "application/json" };
  for (const rpc of SOL_RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST", headers, body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) continue;
      const d: any = await r.json();
      if (d.error) continue;      // RPC returned a JSON-RPC error, try next
      return d.result;
    } catch { /* try next RPC */ }
  }
  return undefined;
}

// ── ETH RPC endpoints ──────────────────────────────────────────────────────────
const ETH_RPCS = [
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
  "https://ethereum.publicnode.com",
];

async function ethRpc(method: string, params: any[], timeoutMs = 8000): Promise<any> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "Content-Type": "application/json" };
  for (const rpc of ETH_RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST", headers, body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) continue;
      const d: any = await r.json();
      if (d.error) continue;
      return d.result;
    } catch { /* try next */ }
  }
  return undefined;
}

// ── Solana TX verifier ─────────────────────────────────────────────────────────
export async function verifySolTx(
  txHash:            string,
  expectedRecipient?: string,
  expectedLamports?:  number,
): Promise<TxResult> {
  const chain: Chain = "sol";

  const tx = await solRpc("getTransaction", [
    txHash,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ]);

  // TX not found
  if (tx === null || tx === undefined) {
    // Maybe it's very recent — try once more with "finalized"
    const tx2 = await solRpc("getTransaction", [
      txHash,
      { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx2) {
      return {
        ok: false, confirmed: false, chain,
        error:
          "❌ Transaction not found on Solana mainnet.\n\n" +
          "Make sure:\n" +
          "• The TX hash is correct (copy directly from your wallet)\n" +
          "• The transaction has at least 1 confirmation\n" +
          "• You sent on <b>Solana Mainnet</b>, not devnet/testnet",
      };
    }
    return parseSolTx(tx2, chain, expectedRecipient, expectedLamports);
  }

  return parseSolTx(tx, chain, expectedRecipient, expectedLamports);
}

function parseSolTx(
  tx: any,
  chain: Chain,
  expectedRecipient?: string,
  expectedLamports?:  number,
): TxResult {
  // Failed transaction
  if (tx.meta?.err !== null && tx.meta?.err !== undefined) {
    return {
      ok: false, confirmed: true, chain,
      error:
        "❌ This transaction <b>failed</b> on-chain.\n\n" +
        "Please send a successful transaction and submit that TX hash.",
    };
  }

  // Parse SOL transfer from instructions
  let lamports: number | undefined;
  let recipient: string | undefined;
  let sender: string | undefined;

  const instructions: any[] = tx.transaction?.message?.instructions ?? [];
  for (const ix of instructions) {
    if (ix.program === "system" && ix.parsed?.type === "transfer") {
      const info = ix.parsed.info;
      lamports  = info?.lamports;
      recipient = info?.destination;
      sender    = info?.source;
      break;
    }
  }

  // Also check inner instructions
  if (!lamports) {
    const innerSets: any[] = tx.meta?.innerInstructions ?? [];
    for (const set of innerSets) {
      for (const ix of set.instructions ?? []) {
        if (ix.program === "system" && ix.parsed?.type === "transfer") {
          const info = ix.parsed?.info;
          if (info?.lamports) {
            lamports  = info.lamports;
            recipient = info.destination;
            sender    = info.source;
            break;
          }
        }
      }
      if (lamports) break;
    }
  }

  // Validate recipient
  if (expectedRecipient && recipient) {
    if (recipient.toLowerCase() !== expectedRecipient.toLowerCase()) {
      return {
        ok: false, confirmed: true, chain, lamports, recipient, sender,
        error:
          `❌ Wrong recipient address.\n\n` +
          `This TX sent to <code>${recipient.slice(0,8)}...${recipient.slice(-6)}</code>\n` +
          `but payment should go to your unique wallet address shown in the payment step.\n\n` +
          `Please send to the correct address and submit a new TX hash.`,
      };
    }
  }

  // Validate amount (allow ±0.001 SOL tolerance for fees)
  if (expectedLamports && lamports) {
    const diff = Math.abs(lamports - expectedLamports);
    if (diff > 1_500_000) { // more than 0.0015 SOL difference
      const sentSol   = (lamports / 1e9).toFixed(4);
      const expectSol = (expectedLamports / 1e9).toFixed(4);
      return {
        ok: false, confirmed: true, chain, lamports, recipient, sender,
        error:
          `❌ Incorrect amount.\n\n` +
          `TX shows <b>${sentSol} SOL</b> transferred, but this order requires <b>${expectSol} SOL</b>.\n\n` +
          `Please send the exact amount and submit the correct TX hash.`,
      };
    }
  }

  return { ok: true, confirmed: true, chain, lamports, recipient, sender };
}

// ── Ethereum TX verifier ───────────────────────────────────────────────────────
export async function verifyEthTx(txHash: string): Promise<TxResult> {
  const chain: Chain = "eth";

  const tx = await ethRpc("eth_getTransactionByHash", [txHash]);

  if (!tx) {
    return {
      ok: false, confirmed: false, chain,
      error:
        "❌ Transaction not found on Ethereum mainnet.\n\n" +
        "Make sure:\n" +
        "• The TX hash is correct (copy directly from your wallet)\n" +
        "• The transaction has been broadcast on <b>Ethereum Mainnet</b>",
    };
  }

  // Still pending (not mined yet)
  if (tx.blockNumber === null || tx.blockNumber === undefined) {
    return {
      ok: false, confirmed: false, chain,
      error:
        "⏳ Transaction is still <b>pending</b> (not yet mined).\n\n" +
        "Please wait for at least 1 block confirmation, then try again.",
    };
  }

  // Check receipt for success
  const receipt = await ethRpc("eth_getTransactionReceipt", [txHash]);
  if (receipt) {
    const status = parseInt(receipt.status, 16);
    if (status === 0) {
      return {
        ok: false, confirmed: true, chain,
        error:
          "❌ This Ethereum transaction <b>failed</b> (reverted).\n\n" +
          "Please send a successful transaction and submit that TX hash.",
      };
    }
  }

  return {
    ok: true, confirmed: true, chain,
    recipient: tx.to ?? undefined,
    sender:    tx.from ?? undefined,
  };
}

// ── Unified entry point ────────────────────────────────────────────────────────
export async function verifyTx(
  txHash:            string,
  expectedRecipient?: string,
  expectedLamports?:  number,
): Promise<TxResult> {
  const chain = detectChain(txHash);
  if (chain === "invalid") {
    return {
      ok: false, confirmed: false, chain,
      error:
        "❌ Invalid transaction hash format.\n\n" +
        "<b>Valid formats:</b>\n" +
        "• Solana: 87–88 base58 characters\n  Example: <code>5KtP9jFh...xyZm</code>\n\n" +
        "• Ethereum: starts with <code>0x</code> + 64 hex characters\n  Example: <code>0x4a3b2c1d...</code>\n\n" +
        "Copy the hash directly from your wallet or block explorer.",
    };
  }
  if (chain === "eth") return verifyEthTx(txHash);
  return verifySolTx(txHash, expectedRecipient, expectedLamports);
}
