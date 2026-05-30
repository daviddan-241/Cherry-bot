#!/usr/bin/env node
/**
 * Push the workspace to GitHub repo: https://github.com/daviddan-241/Cherry-bot
 * Uses GITHUB_PERSONAL_ACCESS_TOKEN from environment.
 */
import { execSync } from "child_process";
import { existsSync } from "fs";

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const REPO = "https://daviddan-241:${GITHUB_TOKEN}@github.com/daviddan-241/Cherry-bot.git";

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_PERSONAL_ACCESS_TOKEN not set");
  process.exit(1);
}

const remoteUrl = `https://daviddan-241:${GITHUB_TOKEN}@github.com/daviddan-241/Cherry-bot.git`;

function run(cmd) {
  console.log(`$ ${cmd.replace(GITHUB_TOKEN, "***")}`);
  execSync(cmd, { stdio: "inherit" });
}

// Configure git if needed
run(`git config user.email "bot@cherry-bot.app" || true`);
run(`git config user.name "Cherry Bot" || true`);

// Check if remote exists
try {
  run(`git remote get-url origin`);
  run(`git remote set-url origin "${remoteUrl}"`);
} catch {
  run(`git remote add origin "${remoteUrl}"`);
}

// Push
run(`git add -A`);
try {
  run(`git commit -m "feat: full Pump.fun Booster Bot implementation" --allow-empty`);
} catch {
  console.log("Nothing new to commit");
}
run(`git push origin HEAD:main --force`);

console.log("\n✅ Successfully pushed to https://github.com/daviddan-241/Cherry-bot");
console.log("\n📋 Render Deployment Steps:");
console.log("1. Go to https://render.com/dashboard");
console.log("2. Click 'New +' → 'Web Service'");
console.log("3. Connect your GitHub repo: daviddan-241/Cherry-bot");
console.log("4. Build command: npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build");
console.log("5. Start command: pnpm --filter @workspace/api-server run start");
console.log("6. Add env vars: TELEGRAM_BOT_TOKEN, MASTER_SEED, ADMIN_TELEGRAM_ID, PAYMENT_SOL_ADDRESS, PAYMENT_ETH_ADDRESS");
