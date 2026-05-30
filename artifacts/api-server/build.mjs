import { build } from "esbuild";
import { cpSync, mkdirSync, copyFileSync } from "fs";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.mjs",
  sourcemap: true,
  external: [
    "@solana/web3.js",
    "pino",
    "pino-pretty",
    "thread-stream",
    "express",
    "cors",
    "cookie-parser",
    "telegraf",
    "bip39",
    "bs58",
    "ed25519-hd-key",
    "tweetnacl",
    "drizzle-orm",
    "pino-http",
  ],
});

// Copy bot images → dist/images/
mkdirSync("dist/images", { recursive: true });
cpSync("src/bot/images", "dist/images", { recursive: true });

// Copy admin dashboard HTML → dist/dashboard.html
copyFileSync("src/dashboard.html", "dist/dashboard.html");

console.log("Build complete: dist/index.mjs + images + dashboard.html");
