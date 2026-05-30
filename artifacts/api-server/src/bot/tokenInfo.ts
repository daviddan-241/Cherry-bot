export interface TokenInfo {
  name: string;
  symbol: string;
  price?: string;
  marketCap?: string;
  liquidity?: string;
  volume24h?: string;
  pairAddress?: string;
}

export async function fetchTokenInfo(ca: string): Promise<TokenInfo | null> {
  try {
    // Try DexScreener first
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
    if (resp.ok) {
      const data = await resp.json() as any;
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        return {
          name: pair.baseToken?.name ?? "Unknown",
          symbol: pair.baseToken?.symbol ?? "???",
          price: pair.priceUsd ? `$${Number(pair.priceUsd).toFixed(8)}` : "N/A",
          marketCap: pair.fdv ? `$${formatNumber(pair.fdv)}` : "N/A",
          liquidity: pair.liquidity?.usd ? `$${formatNumber(pair.liquidity.usd)}` : "N/A",
          volume24h: pair.volume?.h24 ? `$${formatNumber(pair.volume.h24)}` : "N/A",
          pairAddress: pair.pairAddress,
        };
      }
    }
  } catch {
    // ignore
  }

  try {
    // Fallback: pump.fun API
    const resp = await fetch(`https://frontend-api.pump.fun/coins/${ca}`);
    if (resp.ok) {
      const data = await resp.json() as any;
      return {
        name: data.name ?? "Unknown",
        symbol: data.symbol ?? "???",
        price: data.usd_market_cap ? `$${formatNumber(data.usd_market_cap / 1e9)}` : "N/A",
        marketCap: data.usd_market_cap ? `$${formatNumber(data.usd_market_cap)}` : "N/A",
        liquidity: "N/A",
        volume24h: "N/A",
      };
    }
  } catch {
    // ignore
  }

  return null;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}
