import { describe, it, expect } from 'vitest';
import { GitModulesParser } from '../../../src/infrastructure/vault/GitModulesParser.js';

describe('GitModulesParser', () => {
  const parser = new GitModulesParser();

  it('should parse standard .gitmodules format', () => {
    const content = `[submodule "libs/shared"]
\tpath = libs/shared
\turl = https://github.com/org/shared.git

[submodule "services/auth"]
\tpath = services/auth
\turl = git@github.com:org/auth.git
\tbranch = main
`;

    const entries = parser.parse(content);
    expect(entries).toHaveLength(2);

    expect(entries[0].name).toBe('libs/shared');
    expect(entries[0].path).toBe('libs/shared');
    expect(entries[0].url).toBe('https://github.com/org/shared.git');
    expect(entries[0].branch).toBeUndefined();

    expect(entries[1].name).toBe('services/auth');
    expect(entries[1].path).toBe('services/auth');
    expect(entries[1].url).toBe('git@github.com:org/auth.git');
    expect(entries[1].branch).toBe('main');
  });

  it('should handle empty content', () => {
    expect(parser.parse('')).toHaveLength(0);
  });

  it('should handle spaces instead of tabs', () => {
    const content = `[submodule "foo"]
    path = foo
    url = https://example.com/foo.git
`;
    const entries = parser.parse(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('foo');
  });
});
