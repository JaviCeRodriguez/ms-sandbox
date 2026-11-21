import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair, importPKCS8, importSPKI } from "jose";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JWK } from "jose";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const keyDir = join(root, "data/tls");
const privatePath = join(keyDir, "signing-private.pem");
const publicPath = join(keyDir, "signing-public.pem");

export const KID = "ms-sandbox-dev-1";

export type SigningPrivateKey = Awaited<ReturnType<typeof importPKCS8>>;
export type SigningPublicKey = Awaited<ReturnType<typeof importSPKI>>;

export type SigningKeys = {
  privateKey: SigningPrivateKey;
  publicKey: SigningPublicKey;
  jwk: JWK;
};

export async function loadOrCreateSigningKeys(): Promise<SigningKeys> {
  mkdirSync(keyDir, { recursive: true });

  if (!existsSync(privatePath) || !existsSync(publicPath)) {
    const { privateKey, publicKey } = await generateKeyPair("RS256", {
      extractable: true,
      modulusLength: 2048,
    });
    writeFileSync(privatePath, await exportPKCS8(privateKey));
    writeFileSync(publicPath, await exportSPKI(publicKey));
  }

  const privateKey = await importPKCS8(readFileSync(privatePath, "utf8"), "RS256");
  const publicKey = await importSPKI(readFileSync(publicPath, "utf8"), "RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = KID;
  jwk.alg = "RS256";
  jwk.use = "sig";

  return { privateKey, publicKey, jwk };
}
