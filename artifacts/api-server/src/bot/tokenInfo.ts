import { logger } from "../lib/logger.js";

// ── Token info shape ───────────────────────────────────────────────────────────
export interface TokenInfo {
  name:        string;
  symbol:      string;
  chain:       "sol" | "eth" | "bsc" | "base" | "unknown";
  price?:      string;
  priceRaw?:   number;
  marketCap?:  string;
  fdv?:        string;
  fdvRaw?:     number;
  liquidity?:  string;
  volume24h?:  string;
  change1h?:   string;
  change24h?:  string;
  change6h?:   string;
  dex?:        string;
  pairAddress?: string;
  imageUrl?:   string;
  website?:    string;
  twitter?:    string;
  telegram?:   string;
  description?: string;
  boosts?:     number;       // DexScreener boosts active
}

// ── CA format detection ────────────────────────────────────────────────────────
const SOL_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ETH_CA_RE = /^0x[0-9a-fA-F]{40}$/i;

export type CAChain = "sol" | "eth" | "unknown";

export function detectCAChain(ca: string): CAChain {
  if (ETH_CA_RE.test(ca)) return "eth";
  if (SOL_CA_RE.test(ca)) return "sol";
  return "unknown";
}

export function isValidCA(ca: string): boolean {
  return detectCAChain(ca) !== "unknown";
}

// ── Number formatter ───────────────────────────────────────────────────────────
export function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function fmtPrice(p: number): string {
  if (p === 0) return "$0";
  if (p >= 1)         return `$${p.toFixed(4)}`;
  if (p >= 0.0001)    return `$${p.toFixed(6)}`;
  if (p >= 0.00000001) return `$${p.toFixed(10)}`;
  return `$${p.toExponential(4)}`;
}

function change(c: string | number | undefined): string {
  if (c == null || c === "") return "0.00";
  const n = Number(c);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}

// ── Parse a DexScreener pair object into TokenInfo ────────────────────────────
function parseDexPair(pair: any): TokenInfo {
  const priceRaw = pair.priceUsd ? Number(pair.priceUsd) : undefined;
  const fdvRaw   = pair.fdv     ? Number(pair.fdv)       : undefined;
  const mcRaw    = pair.marketCap ? Number(pair.marketCap) : fdvRaw;

  // Resolve image: pair.info.imageUrl is the main one
  const imageUrl =
    pair.info?.imageUrl         ||
    pair.baseToken?.logoURI      ||
    pair.info?.header            ||
    undefined;

  // Social links
  const socials: Record<string, string> = {};
  for (const s of pair.info?.socials ?? []) {
    if (s.type === "twitter")  socials.twitter  = s.url;
    if (s.type === "telegram") socials.telegram = s.url;
    if (s.type === "discord")  socials.discord  = s.url;
  }
  const website = (pair.info?.websites ?? [])[0]?.url;

  const chainId = (pair.chainId ?? "").toLowerCase();
  const chain: TokenInfo["chain"] =
    chainId === "solana" ? "sol" :
    chainId === "ethereum" ? "eth" :
    chainId === "bsc" ? "bsc" :
    chainId === "base" ? "base" : "unknown";

  return {
    name:        pair.baseToken?.name   ?? "Unknown",
    symbol:      pair.baseToken?.symbol ?? "???",
    chain,
    price:       priceRaw !== undefined ? fmtPrice(priceRaw) : "N/A",
    priceRaw,
    marketCap:   mcRaw   ? `$${fmt(mcRaw)}`   : "N/A",
    fdv:         fdvRaw  ? `$${fmt(fdvRaw)}`  : "N/A",
    fdvRaw,
    liquidity:   pair.liquidity?.usd ? `$${fmt(Number(pair.liquidity.usd))}` : "N/A",
    volume24h:   pair.volume?.h24     ? `$${fmt(Number(pair.volume.h24))}`   : "N/A",
    change1h:    change(pair.priceChange?.h1),
    change6h:    change(pair.priceChange?.h6),
    change24h:   change(pair.priceChange?.h24),
    dex:         pair.dexId     ?? "unknown",
    pairAddress: pair.pairAddress,
    imageUrl,
    website,
    twitter:  socials.twitter,
    telegram: socials.telegram,
    boosts:   pair.boosts?.active,
  };
}

// ── HTTP helper with timeout ───────────────────────────────────────────────────
async function getJson(url: string, timeoutMs = 6000): Promise<any | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 CherryBot/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ── 1. DexScreener — tokens endpoint (best: includes image + socials) ─────────
async function fromDexScreenerTokens(ca: string): Promise<TokenInfo | null> {
  const data = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
  if (!data?.pairs?.length) return null;

  // Sort by liquidity descending — pick most liquid pair
  const pairs: any[] = data.pairs;
  pairs.sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0));
  return parseDexPair(pairs[0]);
}

// ── 2. DexScreener — search endpoint (fallback) ───────────────────────────────
async function fromDexScreenerSearch(ca: string): Promise<TokenInfo | null> {
  const data = await getJson(`https://api.dexscreener.com/latest/dex/search?q=${ca}`);
  if (!data?.pairs?.length) return null;

  const pairs: any[] = data.pairs.filter((p: any) =>
    p.baseToken?.address?.toLowerCase() === ca.toLowerCase()
  );
  if (!pairs.length) return null;
  pairs.sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0));
  return parseDexPair(pairs[0]);
}

// ── 3. Pump.fun frontend API ───────────────────────────────────────────────────
async function fromPumpFun(ca: string): Promise<TokenInfo | null> {
  const data = await getJson(`https://frontend-api.pump.fun/coins/${ca}`);
  if (!data?.mint) return null;

  const priceRaw = data.usd_market_cap && data.total_supply
    ? data.usd_market_cap / (data.total_supply / 1e6)
    : undefined;

  return {
    name:        data.name       ?? "Unknown",
    symbol:      data.symbol     ?? "???",
    chain:       "sol",
    price:       priceRaw ? fmtPrice(priceRaw) : "N/A",
    priceRaw,
    marketCap:   data.usd_market_cap ? `$${fmt(Number(data.usd_market_cap))}` : "N/A",
    fdv:         "N/A",
    liquidity:   "N/A",
    volume24h:   "N/A",
    change24h:   "0.00",
    dex:         "pump.fun",
    imageUrl:    data.image_uri   ?? data.metadata?.image,
    website:     data.website     ?? undefined,
    twitter:     data.twitter     ?? undefined,
    telegram:    data.telegram    ?? undefined,
    description: data.description ?? undefined,
  };
}

// ── 4. Birdeye public token info (no auth for basic metadata + image) ──────────
async function fromBirdeye(ca: string): Promise<Partial<TokenInfo> | null> {
  const data = await getJson(
    `https://public-api.birdeye.so/defi/token_overview?address=${ca}`,
    5000
  );
  if (!data?.data) return null;
  const d = data.data;
  return {
    name:      d.name   || undefined,
    symbol:    d.symbol || undefined,
    imageUrl:  d.logoURI || undefined,
    price:     d.price   ? fmtPrice(Number(d.price))    : undefined,
    priceRaw:  d.price   ? Number(d.price)               : undefined,
    marketCap: d.mc      ? `$${fmt(Number(d.mc))}`       : undefined,
    volume24h: d.v24hUSD ? `$${fmt(Number(d.v24hUSD))}`  : undefined,
    liquidity: d.liquidity ? `$${fmt(Number(d.liquidity))}` : undefined,
  };
}

// ── 5. Jupiter token list (Solana logos fallback) ──────────────────────────────
async function jupiterLogo(ca: string): Promise<string | null> {
  try {
    const data = await getJson(
      `https://token.jup.ag/strict`,
      4000
    );
    if (!Array.isArray(data)) return null;
    const found = data.find((t: any) => t.address === ca);
    return found?.logoURI ?? null;
  } catch {
    return null;
  }
}

// ── 6. CoinGecko public search (ETH/multi-chain) ──────────────────────────────
async function fromCoinGecko(ca: string): Promise<Partial<TokenInfo> | null> {
  // Search by contract
  const data = await getJson(
    `https://api.coingecko.com/api/v3/coins/ethereum/contract/${ca}`,
    6000
  );
  if (!data?.id) return null;
  return {
    name:        data.name         ?? undefined,
    symbol:      (data.symbol ?? "").toUpperCase() || undefined,
    imageUrl:    data.image?.large ?? data.image?.small ?? undefined,
    price:       data.market_data?.current_price?.usd
                   ? fmtPrice(Number(data.market_data.current_price.usd))
                   : undefined,
    marketCap:   data.market_data?.market_cap?.usd
                   ? `$${fmt(Number(data.market_data.market_cap.usd))}`
                   : undefined,
    volume24h:   data.market_data?.total_volume?.usd
                   ? `$${fmt(Number(data.market_data.total_volume.usd))}`
                   : undefined,
    description: data.description?.en
                   ? data.description.en.replace(/<[^>]+>/g, "").slice(0, 200)
                   : undefined,
    website:     data.links?.homepage?.[0] ?? undefined,
    twitter:     data.links?.twitter_screen_name
                   ? `https://twitter.com/${data.links.twitter_screen_name}`
                   : undefined,
    telegram:    data.links?.telegram_channel_identifier
                   ? `https://t.me/${data.links.telegram_channel_identifier}`
                   : undefined,
  };
}

// ── Main entry: tries all sources, merges best data ───────────────────────────
export async function fetchTokenInfo(ca: string): Promise<TokenInfo | null> {
  const caChain = detectCAChain(ca);
  if (caChain === "unknown") return null;

  let base: TokenInfo | null = null;

  // --- DexScreener is the gold standard: try both endpoints in parallel ---
  const [dexTokens, dexSearch] = await Promise.allSettled([
    fromDexScreenerTokens(ca),
    fromDexScreenerSearch(ca),
  ]);

  if (dexTokens.status === "fulfilled" && dexTokens.value) {
    base = dexTokens.value;
  } else if (dexSearch.status === "fulfilled" && dexSearch.value) {
    base = dexSearch.value;
  }

  // --- Pump.fun (Solana meme coins not yet on DexScreener) ---
  if (!base && caChain === "sol") {
    base = await fromPumpFun(ca);
  }

  // Still nothing?
  if (!base) {
    // Try CoinGecko for ETH tokens
    if (caChain === "eth") {
      const cg = await fromCoinGecko(ca);
      if (cg?.name) {
        base = {
          name:    cg.name    ?? "Unknown",
          symbol:  cg.symbol  ?? "???",
          chain:   "eth",
          price:   cg.price,
          marketCap: cg.marketCap,
          volume24h: cg.volume24h,
          imageUrl:  cg.imageUrl,
          website:   cg.website,
          twitter:   cg.twitter,
          telegram:  cg.telegram,
          description: cg.description,
        };
      }
    }
  }

  if (!base) return null;

  // --- Enrich missing image ---
  if (!base.imageUrl) {
    if (caChain === "sol") {
      // Try Birdeye and Jupiter in parallel
      const [bird, jup] = await Promise.allSettled([
        fromBirdeye(ca),
        jupiterLogo(ca),
      ]);
      if (bird.status === "fulfilled" && bird.value?.imageUrl)  base.imageUrl = bird.value.imageUrl;
      if (!base.imageUrl && jup.status === "fulfilled" && jup.value) base.imageUrl = jup.value;

      // Enrich other fields from Birdeye if still missing
      if (bird.status === "fulfilled" && bird.value) {
        const b = bird.value;
        if (!base.price      && b.price)     { base.price = b.price; base.priceRaw = b.priceRaw; }
        if (!base.marketCap  && b.marketCap) base.marketCap = b.marketCap;
        if (!base.volume24h  && b.volume24h) base.volume24h = b.volume24h;
        if (!base.liquidity  && b.liquidity) base.liquidity = b.liquidity;
      }
    } else if (caChain === "eth") {
      const cg = await fromCoinGecko(ca);
      if (cg?.imageUrl) base.imageUrl = cg.imageUrl;
    }
  }

  // --- Enrich description + socials from Pump.fun for SOL tokens ---
  if (caChain === "sol" && (!base.description || !base.twitter)) {
    const pf = await fromPumpFun(ca).catch(() => null);
    if (pf) {
      if (!base.description && pf.description) base.description = pf.description;
      if (!base.twitter  && pf.twitter)  base.twitter  = pf.twitter;
      if (!base.telegram && pf.telegram) base.telegram = pf.telegram;
      if (!base.website  && pf.website)  base.website  = pf.website;
      if (!base.imageUrl && pf.imageUrl) base.imageUrl = pf.imageUrl;
    }
  }

  logger.debug({ ca, name: base.name, hasImage: !!base.imageUrl }, "Token fetched");
  return base;
}
