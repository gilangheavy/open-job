import { randomBytes } from 'crypto';

/**
 * Generates an RFC 9562 UUID v7 (time-ordered).
 *
 * Layout (128 bits):
 *   - 48 bits: Unix timestamp in milliseconds (big-endian)
 *   - 4 bits:  version (0b0111 = 7)
 *   - 12 bits: random
 *   - 2 bits:  variant (0b10)
 *   - 62 bits: random
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const timestamp = Date.now();

  // 48-bit timestamp
  bytes[0] = (timestamp / 2 ** 40) & 0xff;
  bytes[1] = (timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp >>> 24) & 0xff;
  bytes[3] = (timestamp >>> 16) & 0xff;
  bytes[4] = (timestamp >>> 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Version 7 (high nibble of byte 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant (RFC 4122 / 9562) — top two bits of byte 8 = 10
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-' +
    hex.slice(12, 16) +
    '-' +
    hex.slice(16, 20) +
    '-' +
    hex.slice(20, 32)
  );
}

export const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuidV7 = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V7_REGEX.test(value);
