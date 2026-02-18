import { describe, it, expect } from 'vitest';
import { ChunkingStrategy, type RawChunk } from '../../../src/infrastructure/vault/ChunkingStrategy.js';

describe('ChunkingStrategy', () => {
  const strategy = new ChunkingStrategy();

  it('should chunk by headings', () => {
    const body = `# Introduction

This is the intro.

## Details

Detail content here.

## Conclusion

Final words.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(3);
    expect(chunks[0].headingPath).toBe('Introduction');
    expect(chunks[0].text).toContain('This is the intro.');
    expect(chunks[1].headingPath).toBe('Introduction / Details');
    expect(chunks[2].headingPath).toBe('Introduction / Conclusion');
  });

  it('should handle content before first heading', () => {
    const body = `Some preamble text.

# First Heading

Content.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(2);
    expect(chunks[0].headingPath).toBe('');
    expect(chunks[0].text).toContain('preamble');
  });

  it('should handle no headings', () => {
    const body = 'Just plain text with no headings at all.';
    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('plain text');
  });

  it('should handle empty body', () => {
    const chunks = strategy.chunkByHeadings('test.md', '');
    expect(chunks.length).toBe(0);
  });

  it('should not split on headings inside code blocks', () => {
    const body = `# Real Heading

Some code:

\`\`\`markdown
# This is not a heading
## Neither is this
\`\`\`

Still same section.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('This is not a heading');
  });

  it('should track correct line numbers', () => {
    const body = `# First

Line 3.

# Second

Line 7.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[1].startLine).toBe(5);
  });
});
