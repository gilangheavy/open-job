import { uuidv7, isUuidV7, UUID_V7_REGEX } from './uuid.util';

describe('uuid.util', () => {
  describe('uuidv7', () => {
    it('produces a string matching the v7 layout', () => {
      const id = uuidv7();
      expect(id).toMatch(UUID_V7_REGEX);
    });

    it('encodes the current time in the leading 48 bits (monotonic-ish)', () => {
      const before = Date.now();
      const id = uuidv7();
      const after = Date.now();

      const ts = parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('generates distinct values across rapid invocations', () => {
      const ids = new Set(Array.from({ length: 1_000 }, () => uuidv7()));
      expect(ids.size).toBe(1_000);
    });

    it('sets the version nibble to 7 and the variant to RFC 9562', () => {
      const id = uuidv7();
      expect(id.charAt(14)).toBe('7');
      expect(['8', '9', 'a', 'b']).toContain(id.charAt(19).toLowerCase());
    });
  });

  describe('isUuidV7', () => {
    it('returns true for a freshly generated v7', () => {
      expect(isUuidV7(uuidv7())).toBe(true);
    });

    it('returns false for a UUID v4', () => {
      expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    });

    it('returns false for malformed input', () => {
      expect(isUuidV7('not-a-uuid')).toBe(false);
      expect(isUuidV7('')).toBe(false);
      expect(isUuidV7(undefined)).toBe(false);
      expect(isUuidV7(null)).toBe(false);
      expect(isUuidV7(12345)).toBe(false);
    });
  });
});
