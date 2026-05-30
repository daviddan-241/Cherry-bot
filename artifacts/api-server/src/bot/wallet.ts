import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import nacl from "tweetnacl";
import bs58 from "bs58";

export function deriveWalletForUser(userId: number): { address: string; privateKey: string } {
  const masterSeed = process.env.MASTER_SEED!;
  const seed = bip39.mnemonicToSeedSync(masterSeed);
  // Derive unique wallet per user using user ID as account index
  const path = `m/44'/501'/${userId}'/0'`;
  const derived = derivePath(path, seed.toString("hex"));
  const keypair = nacl.sign.keyPair.fromSeed(derived.key);
  const address = bs58.encode(keypair.publicKey);
  const privateKey = bs58.encode(keypair.secretKey);
  return { address, privateKey };
}
