import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { logger } from "../lib/logger.js";

export function deriveWalletForUser(userId: number): { address: string; privateKey: string } {
  const masterSeed = process.env.MASTER_SEED;
  if (!masterSeed) {
    logger.warn("MASTER_SEED not set — returning placeholder wallet");
    return { address: "WALLET_NOT_CONFIGURED", privateKey: "" };
  }
  try {
    const seed = bip39.mnemonicToSeedSync(masterSeed);
    const path = `m/44'/501'/${userId}'/0'`;
    const derived = derivePath(path, seed.toString("hex"));
    const keypair = nacl.sign.keyPair.fromSeed(derived.key);
    const address = bs58.encode(keypair.publicKey);
    const privateKey = bs58.encode(keypair.secretKey);
    return { address, privateKey };
  } catch (err) {
    logger.error({ err }, "Failed to derive wallet for user");
    return { address: "WALLET_ERROR", privateKey: "" };
  }
}
