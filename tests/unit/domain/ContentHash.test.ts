import { describe, it, expect } from 'vitest';
import { ContentHash } from '../../../src/domain/value-objects/ContentHash.js';

describe('ContentHash', () => {
  it('should produce consistent SHA-256 for same input', () => {
    const h1 = ContentHash.fromText('hello world');
    const h2 = ContentHash.fromText('hello world');
    expect(h1.value).toBe(h2.value);
    expect(h1.value).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('should produce different hash for different input', () => {
    const h1 = ContentHash.fromText('hello');
    const h2 = ContentHash.fromText('world');
    expect(h1.value).not.toBe(h2.value);
  });

  it('should equal another ContentHash with same value', () => {
    const h1 = ContentHash.fromText('test');
    const h2 = ContentHash.fromText('test');
    expect(h1.equals(h2)).toBe(true);
  });

  it('should create from existing hex string', () => {
    const h1 = ContentHash.fromText('test');
    const h2 = ContentHash.fromHex(h1.value);
    expect(h1.equals(h2)).toBe(true);
  });
});
