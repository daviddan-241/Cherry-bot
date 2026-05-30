export interface TokenInfo {
  name: string;
  symbol: string;
  price?: string;
  marketCap?: string;
  liquidity?: string;
  volume24h?: string;
  change24h?: string;
  dex?: string;
  imageUrl?: string;
}

export async function fetchTokenInfo(ca: string): Promise<TokenInfo | null> {
  // Try DexScreener
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        return {
          name:      pair.baseToken?.name    ?? "Unknown",
          symbol:    pair.baseToken?.symbol  ?? "???",
          price:     pair.priceUsd           ? `$${Number(pair.priceUsd).toFixed(8)}` : "0.00e+0",
          marketCap: pair.fdv                ? `$${fmt(pair.fdv)}`                    : "0.00",
          liquidity: pair.liquidity?.usd     ? `$${fmt(pair.liquidity.usd)}`          : "0.00",
          volume24h: pair.volume?.h24        ? `$${fmt(pair.volume.h24)}`             : "0.00",
          change24h: pair.priceChange?.h24   ? String(Number(pair.priceChange.h24).toFixed(2)) : "0.00",
          dex:       pair.dexId              ?? "pumpfun",
          imageUrl:  pair.info?.imageUrl     ?? pair.baseToken?.logoURI,
        };
      }
    }
  } catch { /* ignore */ }

  // Try pump.fun
  try {
    const resp = await fetch(`https://frontend-api.pump.fun/coins/${ca}`);
    if (resp.ok) {
      const data = await resp.json() as any;
      return {
        name:      data.name   ?? "Unknown",
        symbol:    data.symbol ?? "???",
        price:     "0.00e+0",
        marketCap: data.usd_market_cap ? `$${fmt(data.usd_market_cap)}` : "0.00",
        liquidity: "0.00",
        volume24h: "0.00",
        change24h: "0.00",
        dex:       "pumpfun",
        imageUrl:  data.image_uri,
      };
    }
  } catch { /* ignore */ }

  return null;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}
