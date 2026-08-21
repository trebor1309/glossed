import { createHmac } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value) {
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let accumulator = 0;
  const bytes = [];

  for (const character of normalized) {
    const digit = base32Alphabet.indexOf(character);
    if (digit < 0) throw new Error("E2E_ADMIN_TOTP_SECRET is not valid base32.");

    accumulator = (accumulator << 5) | digit;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpCode(secret, timestamp = Date.now()) {
  const counter = BigInt(Math.floor(timestamp / 30_000));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(binaryCode % 1_000_000).padStart(6, "0");
}
