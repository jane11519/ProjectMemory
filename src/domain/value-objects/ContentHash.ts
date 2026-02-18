import { createHash } from 'node:crypto';

/** 不可變的 SHA-256 內容雜湊值物件 */
export class ContentHash {
  private constructor(public readonly value: string) {}

  /** 從原始文字計算 SHA-256 */
  static fromText(text: string): ContentHash {
    const hash = createHash('sha256').update(text, 'utf-8').digest('hex');
    return new ContentHash(hash);
  }

  /** 從既有的 hex 字串建立（不重新計算） */
  static fromHex(hex: string): ContentHash {
    return new ContentHash(hex);
  }

  equals(other: ContentHash): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
