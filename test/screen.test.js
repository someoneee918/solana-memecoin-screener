import test from "node:test";
import assert from "node:assert/strict";
import { filterRows, fromDexScreener, fromGecko, parseAmount, parseDuration, screen } from "../lib/screen.js";

const row = (o) => ({ symbol: "X", name: "", mint: "M", pool: "P", dex: "pumpswap", ageMs: 3600_000, priceUsd: 1, mcap: 1e6, liq: 5e4, vol5m: 1, vol1h: 10, vol24h: 100, chg5m: 0, chg1h: 0, chg24h: 0, buys1h: 5, sells1h: 5, buyers1h: 4, ...o });

test("amounts and durations parse", () => {
  assert.equal(parseAmount("25k"), 25000);
  assert.equal(parseAmount("$1.5m"), 1500000);
  assert.equal(parseAmount("1,000"), 1000);
  assert.equal(parseDuration("30m"), 1800000);
  assert.equal(parseDuration("6h"), 21600000);
  assert.equal(parseDuration("45"), 2700000);
  assert.throws(() => parseAmount("lots"));
  assert.throws(() => parseDuration("soon"));
});

test("one row per token, keeping the deepest pool", () => {
  const out = screen([row({ mint: "A", liq: 10, pool: "small" }), row({ mint: "A", liq: 999, pool: "deep" }), row({ mint: "B" })]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.mint === "A").pool, "deep");
});

test("filters apply and missing values fail a filter that needs them", () => {
  const rows = [row({ mint: "A", liq: 5e4, mcap: 5e5 }), row({ mint: "B", liq: 1e3, mcap: 5e5 }), row({ mint: "C", liq: null })];
  assert.deepEqual(screen(rows, { minLiq: 2e4 }).map((r) => r.mint), ["A"]);
  assert.deepEqual(screen(rows, { maxMcap: 1e5 }).map((r) => r.mint), []);
  assert.equal(screen([row({ mint: "Apump" }), row({ mint: "B" })], { pumpOnly: true }).length, 1);
  assert.equal(screen([row({ mint: "A", symbol: "CAT" }), row({ mint: "B", symbol: "DOG" })], { search: "cat" }).length, 1);
  assert.equal(screen([row({ mint: "A", ageMs: 60_000 }), row({ mint: "B", ageMs: 7200_000 })], { maxAge: 600_000 }).length, 1);
});

test("sorts descending, newest first for age, and limits", () => {
  const rows = [row({ mint: "A", chg1h: 5, ageMs: 100 }), row({ mint: "B", chg1h: 50, ageMs: 900 }), row({ mint: "C", chg1h: null, ageMs: 10 })];
  assert.deepEqual(screen(rows, { sort: "chg1h" }).map((r) => r.mint), ["B", "A", "C"]);
  assert.deepEqual(screen(rows, { sort: "age" }).map((r) => r.mint), ["C", "A", "B"]);
  assert.equal(screen(rows, { limit: 2 }).length, 2);
  assert.throws(() => screen(rows, { sort: "vibes" }));
});

test("GeckoTerminal and DexScreener shapes normalise to the same row", () => {
  const now = Date.parse("2026-11-18T00:00:00Z");
  const pool = {
    attributes: { address: "Pool", name: "JALU / SOL", pool_created_at: "2026-11-17T23:00:00Z", base_token_price_usd: "0.5", fdv_usd: "1000", market_cap_usd: null, reserve_in_usd: "200",
      volume_usd: { m5: "1", h1: "2", h24: "3" }, price_change_percentage: { m5: "1.5", h1: "-2", h24: "10" }, transactions: { h1: { buys: 7, sells: 3, buyers: 5 } } },
    relationships: { base_token: { data: { id: "solana_Mint" } }, dex: { data: { id: "pumpswap" } } },
  };
  const tokens = new Map([["solana_Mint", { attributes: { address: "Mint", symbol: "JALU", name: "Jason &amp; Lucia" } }]]);
  const g = fromGecko(pool, tokens, now);
  assert.equal(g.name, "Jason & Lucia");
  assert.equal(g.mcap, 1000);
  assert.equal(g.ageMs, 3600_000);
  assert.equal(g.buyers1h, 5);
  const d = fromDexScreener({ baseToken: { symbol: "B", name: "Bonk", address: "Mint" }, pairAddress: "P", dexId: "orca", pairCreatedAt: now - 1000, priceUsd: "0.1", marketCap: 5, fdv: 9, liquidity: { usd: 3 }, volume: { h24: 4 }, priceChange: { h1: 1 }, txns: { h1: { buys: 1, sells: 2 } } }, now);
  assert.deepEqual(Object.keys(d), Object.keys(g));
  assert.equal(d.mcap, 5);
});

test("--dex keeps a token whose deepest pool is on another DEX, using its pool on that DEX", () => {
  const rows = [row({ mint: "A", dex: "meteora", pool: "deep", liq: 9e5 }), row({ mint: "A", dex: "pumpswap", pool: "pump", liq: 5e4 }), row({ mint: "B", dex: "raydium" })];
  const out = screen(rows, { dex: "PumpSwap" });
  assert.deepEqual(out.map((r) => r.pool), ["pump"]);
  assert.equal(screen(rows).find((r) => r.mint === "A").pool, "deep");
});

test("filterRows returns all matching tokens while screen limits output", () => {
  const rows = [
    row({ mint: "A", vol24h: 50 }),
    row({ mint: "B", vol24h: 40 }),
    row({ mint: "C", vol24h: 30 }),
    row({ mint: "D", vol24h: 20 }),
    row({ mint: "E", vol24h: 10 }),
  ];
  const matched = filterRows(rows, { limit: 2 });
  const limited = screen(rows, { limit: 2 });
  assert.equal(matched.length, 5);
  assert.equal(limited.length, 2);
  assert.deepEqual(limited.map((r) => r.mint), ["A", "B"]);
});
