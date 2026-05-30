import { build } from "esbuild";

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
  loader: {
    ".jpeg": "copy",
    ".jpg": "copy",
    ".png": "copy",
  },
  assetNames: "images/[name]",
});

console.log("Build complete: dist/index.mjs");
