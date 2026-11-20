import test from "node:test";
import assert from "node:assert/strict";
import { parseOptions, screen } from "../lib/screen.js";

const row = (o) => ({
  symbol: "X", name: "Token", mint: "M", pool: "P", dex: "pumpswap",
  ageMs: 3600_000, priceUsd: 1, mcap: 1e6, liq: 5e4, vol5m: 1, vol1h: 10, vol24h: 100,
  chg5m: 0, chg1h: 0, chg24h: 0, buys1h: 5, sells1h: 5, buyers1h: 4, ...o,
});

test("parseOptions parses valid inputs correctly", () => {
  const opts = parseOptions({
    source: "boosted",
    pages: "3",
    "min-liq": "50k",
    "max-liq": "1m",
    "min-age": "1h",
    "min-change-1h": "15.5",
    "min-buyers": "10",
    sort: "vol1h",
    limit: "50",
    watch: "45",
    search: "bonk",
    "pump-only": true,
  });

  assert.equal(opts.source, "boosted");
  assert.equal(opts.pages, 3);
  assert.equal(opts.watch, 45);
  assert.equal(opts.filters.minLiq, 50000);
  assert.equal(opts.filters.maxLiq, 1000000);
  assert.equal(opts.filters.minAge, 3600000);
  assert.equal(opts.filters.minChange1h, 15.5);
  assert.equal(opts.filters.minBuyers, 10);
  assert.equal(opts.filters.sort, "vol1h");
  assert.equal(opts.filters.limit, 50);
  assert.equal(opts.filters.pumpOnly, true);
  assert.ok(opts.filters.search instanceof RegExp);
  assert.ok(opts.filters.search.test("BONK"));
});

test("parseOptions defaults when flags are omitted", () => {
  const opts = parseOptions({});
  assert.equal(opts.source, "trending");
  assert.equal(opts.pages, 2);
  assert.equal(opts.watch, 0);
  assert.equal(opts.filters.sort, "vol");
  assert.equal(opts.filters.limit, 25);
  assert.equal(opts.filters.search, undefined);
  assert.equal(opts.filters.minBuyers, undefined);
});

test("parseOptions rejects non-numeric --min-change-1h", () => {
  assert.throws(
    () => parseOptions({ "min-change-1h": "abc" }),
    /Invalid value for --min-change-1h/,
  );
  assert.throws(
    () => parseOptions({ "min-change-1h": true }),
    /Invalid value for --min-change-1h/,
  );
});

test("parseOptions rejects non-numeric and boolean --min-buyers", () => {
  assert.throws(
    () => parseOptions({ "min-buyers": "abc" }),
    /Invalid value for --min-buyers/,
  );
  assert.throws(
    () => parseOptions({ "min-buyers": true }),
    /Invalid value for --min-buyers/,
  );
});

test("parseOptions rejects unknown --sort key before fetching", () => {
  assert.throws(
    () => parseOptions({ sort: "vibes" }),
    /Unknown sort "vibes"/,
  );
  assert.throws(
    () => parseOptions({ sort: "invalidKey" }),
    /Unknown sort "invalidKey"/,
  );
});

test("parseOptions rejects invalid --search regex before fetching", () => {
  assert.throws(
    () => parseOptions({ search: "[unclosed-bracket" }),
    /Invalid --search regex/,
  );
  assert.throws(
    () => parseOptions({ search: "(?invalid-group" }),
    /Invalid --search regex/,
  );
});

test("parseOptions rejects unknown --source", () => {
  assert.throws(
    () => parseOptions({ source: "unsupported_source" }),
    /Unknown source "unsupported_source"/,
  );
});

test("screen accepts compiled RegExp or string for search filter", () => {
  const rows = [
    row({ mint: "A", symbol: "DOGE", name: "Doge Coin" }),
    row({ mint: "B", symbol: "PEPE", name: "Pepe Frog" }),
  ];

  const withRegex = screen(rows, { search: /pepe/i });
  assert.equal(withRegex.length, 1);
  assert.equal(withRegex[0].symbol, "PEPE");

  const withString = screen(rows, { search: "doge" });
  assert.equal(withString.length, 1);
  assert.equal(withString[0].symbol, "DOGE");
});
