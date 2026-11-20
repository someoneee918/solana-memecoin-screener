import { getJson, sleep } from "./core.js";

const GECKO = "https://api.geckoterminal.com/api/v2/networks/solana";
const decode = (s) => String(s ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const clean = (s, max = 64) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** One GeckoTerminal pool (plus its included base token) -> a flat row. */
export function fromGecko(pool, tokens, now = Date.now()) {
  const a = pool.attributes;
  const baseId = pool.relationships?.base_token?.data?.id || "";
  const token = tokens.get(baseId)?.attributes || {};
  const tx = a.transactions || {};
  return {
    symbol: clean(decode(token.symbol || String(a.name || "").split(" / ")[0]), 24),
    name: clean(decode(token.name || "")),
    mint: token.address || baseId.replace(/^solana_/, ""),
    pool: a.address,
    dex: clean(pool.relationships?.dex?.data?.id || "", 32),
    ageMs: a.pool_created_at ? now - Date.parse(a.pool_created_at) : null,
    priceUsd: num(a.base_token_price_usd),
    mcap: num(a.market_cap_usd) || num(a.fdv_usd) || null,
    liq: num(a.reserve_in_usd),
    vol5m: num(a.volume_usd?.m5), vol1h: num(a.volume_usd?.h1), vol24h: num(a.volume_usd?.h24),
    chg5m: num(a.price_change_percentage?.m5), chg1h: num(a.price_change_percentage?.h1), chg24h: num(a.price_change_percentage?.h24),
    buys1h: tx.h1?.buys ?? null, sells1h: tx.h1?.sells ?? null, buyers1h: tx.h1?.buyers ?? null,
  };
}

/** One DexScreener pair -> the same flat row shape. */
export function fromDexScreener(p, now = Date.now()) {
  return {
    symbol: clean(p.baseToken?.symbol, 24) || "?",
    name: clean(p.baseToken?.name),
    mint: p.baseToken?.address,
    pool: p.pairAddress,
    dex: clean(p.dexId, 32),
    ageMs: p.pairCreatedAt ? now - p.pairCreatedAt : null,
    priceUsd: num(p.priceUsd),
    mcap: num(p.marketCap) || num(p.fdv) || null,
    liq: num(p.liquidity?.usd),
    vol5m: num(p.volume?.m5), vol1h: num(p.volume?.h1), vol24h: num(p.volume?.h24),
    chg5m: num(p.priceChange?.m5), chg1h: num(p.priceChange?.h1), chg24h: num(p.priceChange?.h24),
    buys1h: p.txns?.h1?.buys ?? null, sells1h: p.txns?.h1?.sells ?? null, buyers1h: null,
  };
}

async function geckoPools(path, pages) {
  const rows = [];
  for (let page = 1; page <= pages; page++) {
    const res = await getJson(`${GECKO}/${path}?include=base_token&page=${page}`);
    const tokens = new Map((res.included || []).map((t) => [t.id, t]));
    for (const pool of res.data || []) rows.push(fromGecko(pool, tokens));
    if ((res.data || []).length < 20) break;
    if (page < pages) await sleep(400);
  }
  return rows;
}

async function boosted() {
  const boosts = await getJson("https://api.dexscreener.com/token-boosts/top/v1");
  const mints = [...new Set(boosts.filter((b) => b.chainId === "solana").map((b) => b.tokenAddress))].slice(0, 30);
  if (!mints.length) return [];
  const pairs = await getJson(`https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`);
  return pairs.map((p) => fromDexScreener(p));
}

/** Load raw rows for a source: "trending", "new" or "boosted". */
export async function load(source, pages = 2) {
  if (source === "trending") return geckoPools("trending_pools", pages);
  if (source === "new") return geckoPools("new_pools", pages);
  if (source === "boosted") return boosted();
  throw new Error(`Unknown source "${source}". Use trending, new or boosted.`);
}

/** "30m", "6h", "2d" or a plain number of minutes -> milliseconds. */
export function parseDuration(text) {
  const m = /^(\d+(?:\.\d+)?)\s*([smhd]?)$/i.exec(String(text).trim());
  if (!m) throw new Error(`Cannot read "${text}" as a duration. Use forms like 30m, 6h or 2d.`);
  const unit = { s: 1000, m: 60_000, h: 3600_000, d: 86400_000 }[m[2].toLowerCase() || "m"];
  return Number(m[1]) * unit;
}

/** "25k", "1.5m", "2b" or a plain number -> number. */
export function parseAmount(text) {
  const m = /^\$?(\d+(?:\.\d+)?)\s*([kmb]?)$/i.exec(String(text).trim().replace(/,/g, ""));
  if (!m) throw new Error(`Cannot read "${text}" as an amount. Use forms like 25000, 25k or 1.5m.`);
  return Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] || 1);
}

const SORTS = {
  vol: (r) => r.vol24h, vol1h: (r) => r.vol1h, vol5m: (r) => r.vol5m, liq: (r) => r.liq, mcap: (r) => r.mcap,
  chg5m: (r) => r.chg5m, chg1h: (r) => r.chg1h, chg24h: (r) => r.chg24h, buyers: (r) => r.buyers1h ?? r.buys1h,
  age: (r) => (r.ageMs === null ? null : -r.ageMs), // newest first
};
export const SORT_KEYS = Object.keys(SORTS);

/** Keep one row per token (its deepest pool), apply filters and sort. Pure function. */
export function filterRows(rows, f = {}) {
  const best = new Map();
  const dex = f.dex ? f.dex.toLowerCase() : null;
  for (const r of rows) {
    if (!r.mint) continue;
    // --dex picks pools, so apply it before choosing each token's deepest pool:
    // a token whose deepest pool is elsewhere still has a pool on this DEX.
    if (dex && !String(r.dex).toLowerCase().includes(dex)) continue;
    const prev = best.get(r.mint);
    if (!prev || (r.liq || 0) > (prev.liq || 0)) best.set(r.mint, r);
  }
  const within = (v, min, max) => {
    if (min === undefined && max === undefined) return true;
    if (v === null || v === undefined) return false;
    return (min === undefined || v >= min) && (max === undefined || v <= max);
  };
  let out = [...best.values()].filter((r) =>
    within(r.liq, f.minLiq, f.maxLiq) &&
    within(r.mcap, f.minMcap, f.maxMcap) &&
    within(r.vol24h, f.minVol, undefined) &&
    within(r.vol1h, f.minVol1h, undefined) &&
    within(r.ageMs, f.minAge, f.maxAge) &&
    within(r.chg1h, f.minChange1h, undefined) &&
    within(r.buyers1h ?? r.buys1h, f.minBuyers, undefined) &&
    (!f.pumpOnly || String(r.mint).endsWith("pump")) &&
    (!f.search || new RegExp(f.search, "i").test(`${r.symbol} ${r.name}`)),
  );
  const key = SORTS[f.sort || "vol"];
  if (!key) throw new Error(`Unknown sort "${f.sort}". Use one of: ${SORT_KEYS.join(", ")}.`);
  out.sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
  return out;
}

/** Keep one row per token (its deepest pool), apply filters, sort and cut. Pure function. */
export function screen(rows, f = {}) {
  const out = filterRows(rows, f);
  return out.slice(0, f.limit || 25);
}
