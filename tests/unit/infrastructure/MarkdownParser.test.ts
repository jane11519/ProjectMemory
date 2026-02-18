import { describe, it, expect } from 'vitest';
import { MarkdownParser } from '../../../src/infrastructure/vault/MarkdownParser.js';

describe('MarkdownParser', () => {
  const parser = new MarkdownParser();

  it('should extract frontmatter and body', () => {
    const md = `---
title: Test Doc
tags: [auth, jwt]
namespace: services/auth
---

# Heading One

Body text here.`;

    const result = parser.parse(md);
    expect(result.frontmatter.title).toBe('Test Doc');
    expect(result.frontmatter.tags).toEqual(['auth', 'jwt']);
    expect(result.body).toContain('# Heading One');
    expect(result.body).toContain('Body text here.');
  });

  it('should handle markdown without frontmatter', () => {
    const md = '# Just a heading\n\nSome content.';
    const result = parser.parse(md);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toContain('# Just a heading');
  });

  it('should handle empty content', () => {
    const result = parser.parse('');
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('');
  });
});
