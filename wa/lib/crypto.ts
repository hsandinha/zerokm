import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM para tokens/segredos da Meta gravados no banco.
// APP_ENCRYPTION_KEY: 32 bytes em hex (openssl rand -hex 32)

function getKey(): Buffer {
  const hex = process.env.APP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("APP_ENCRYPTION_KEY ausente ou inválida (precisa de 64 chars hex)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(stored: string): string {
  const [v, ivHex, tagHex, dataHex] = stored.split(":");
  if (v !== "v1") throw new Error("Formato de segredo desconhecido");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
