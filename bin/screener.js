#!/usr/bin/env node
import { age, c, footer, main, parseArgs, pct, price, sleep, table, usd } from "../lib/core.js";
import { load, parseOptions, screen, SORT_KEYS } from "../lib/screen.js";

const HELP = `solana-memecoin-screener: filter live Solana memecoins from the terminal

Usage:
  screener [options]

Source:
  --source <s>          trending (default), new, or boosted
  --pages <n>           Pages to scan, 20 pools each, 1 to 10 (default 2)

Filters (amounts take 25000, 25k, 1.5m; ages take 30m, 6h, 2d):
  --min-liq <usd>       Minimum liquidity          --max-liq <usd>
  --min-mcap <usd>      Minimum market cap         --max-mcap <usd>
  --min-vol <usd>       Minimum 24h volume         --min-vol-1h <usd>
  --min-age <age>       Older than                 --max-age <age>
  --min-change-1h <%>   1h price change at least this
  --min-buyers <n>      Unique buyers in the last hour at least this
  --dex <name>          Only one DEX: pumpswap, raydium, meteora, orca…
  --pump-only           Only pump.fun coins
  --search <regex>      Name or ticker matches

Output:
  --sort <key>          ${SORT_KEYS.join(", ")} (default vol)
  --limit <n>           Rows to show (default 25)
  --watch <seconds>     Refresh on a loop (minimum 15)
  --json                Print rows as JSON
  --help                Show this help

Examples:
  screener --min-liq 20k --max-mcap 2m --sort chg1h
  screener --source new --max-age 30m --min-buyers 50 --pump-only
  screener --source boosted --min-vol 100k --watch 30
`;

const signed = (n) => (n === null ? c.dim("-") : n >= 0 ? c.green(pct(n)) : c.red(pct(n)));

main(async () => {
  const args = parseArgs(process.argv.slice(2), { booleans: ["json", "help", "pump-only"] });
  if (args.help) { console.log(HELP); return; }
  const { source, pages, filters, watch } = parseOptions(args);

  const runOnce = async () => {
    const raw = await load(source, pages);
    const rows = screen(raw, filters);
    if (args.json) { console.log(JSON.stringify(rows, null, 2)); return; }
    if (watch && process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
    console.log(c.bold(`Solana memecoin screener`) + c.dim(`  ·  ${source}  ·  ${rows.length} of ${raw.length} pools match  ·  ${new Date().toLocaleTimeString("en-GB")}\n`));
    if (!rows.length) { console.log("Nothing matches these filters. Loosen one, or scan more with --pages."); return; }
    table(
      [
        { title: "Ticker", width: 10 }, { title: "Age", width: 5, right: true }, { title: "Price", width: 12, right: true },
        { title: "Mcap", width: 9, right: true }, { title: "Liq", width: 9, right: true }, { title: "Vol 24h", width: 9, right: true },
        { title: "5m", width: 8, right: true }, { title: "1h", width: 8, right: true }, { title: "24h", width: 9, right: true },
        { title: "Buys/Sells 1h", width: 13, right: true }, { title: "DEX", width: 9 }, { title: "Mint", width: 44 },
      ],
      rows.map((r) => [
        c.bold(r.symbol), r.ageMs === null ? "-" : age(r.ageMs), price(r.priceUsd), usd(r.mcap), usd(r.liq), usd(r.vol24h),
        signed(r.chg5m), signed(r.chg1h), signed(r.chg24h),
        r.buys1h === null ? "-" : `${r.buys1h}/${r.sells1h}`, r.dex, c.dim(r.mint),
      ]),
    );
  };

  await runOnce();
  while (watch) {
    await sleep(watch * 1000);
    try { await runOnce(); } catch (err) { console.error(c.red(`Refresh failed: ${err.message}`)); }
  }
  if (!args.json) footer("/solana-memecoin-screener", "This screener with AI ratings on every coin, live");
});
