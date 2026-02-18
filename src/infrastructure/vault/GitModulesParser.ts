export interface SubmoduleEntry {
  name: string;
  path: string;
  url: string;
  branch?: string;
}

/**
 * 解析 .gitmodules INI 格式
 * 格式：
 *   [submodule "name"]
 *       path = value
 *       url = value
 *       branch = value (optional)
 */
export class GitModulesParser {
  parse(content: string): SubmoduleEntry[] {
    if (!content.trim()) return [];

    const entries: SubmoduleEntry[] = [];
    let current: Partial<SubmoduleEntry> | null = null;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();

      // 檢測 section header: [submodule "name"]
      const sectionMatch = /^\[submodule\s+"(.+)"\]$/.exec(line);
      if (sectionMatch) {
        if (current?.path && current?.url) {
          entries.push(current as SubmoduleEntry);
        }
        current = { name: sectionMatch[1] };
        continue;
      }

      if (!current) continue;

      // 解析 key = value
      const kvMatch = /^(\w+)\s*=\s*(.+)$/.exec(line);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        switch (key) {
          case 'path': current.path = value.trim(); break;
          case 'url': current.url = value.trim(); break;
          case 'branch': current.branch = value.trim(); break;
        }
      }
    }

    // 最後一個 entry
    if (current?.path && current?.url) {
      entries.push(current as SubmoduleEntry);
    }

    return entries;
  }
}
