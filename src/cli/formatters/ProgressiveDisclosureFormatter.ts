import type { SearchResult } from '../../domain/entities/SearchResult.js';

export type OutputFormat = 'json' | 'text';
export type DetailLevel = 'brief' | 'normal' | 'full';

/**
 * 漸進式揭露格式化器：根據 level 控制輸出細節
 *
 * - brief：僅 title + score（適合 inline prompt）
 * - normal：title + snippet + score（預設）
 * - full：含完整 text + metadata（用於 expand/full 指令）
 */
export class ProgressiveDisclosureFormatter {
  formatSearchResults(
    results: SearchResult[],
    format: OutputFormat,
    level: DetailLevel = 'normal',
  ): string {
    if (format === 'json') {
      return JSON.stringify(this.shapeResults(results, level), null, 2);
    }
    return this.textResults(results, level);
  }

  formatObject(data: unknown, format: OutputFormat): string {
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }
    return this.flattenToText(data);
  }

  /** 根據 level 篩選欄位 */
  private shapeResults(results: SearchResult[], level: DetailLevel): unknown[] {
    return results.map((r) => {
      if (level === 'brief') {
        return {
          chunkId: r.chunkId,
          title: r.title,
          docPath: r.docPath,
          score: r.finalScore,
        };
      }
      if (level === 'full') {
        return { ...r };
      }
      // normal
      return {
        chunkId: r.chunkId,
        title: r.title,
        docPath: r.docPath,
        headingPath: r.headingPath,
        snippet: r.snippet,
        score: r.finalScore,
        lexNorm: r.lexNorm,
        vecNorm: r.vecNorm,
      };
    });
  }

  /** 人類可讀的搜尋結果文字格式 */
  private textResults(results: SearchResult[], level: DetailLevel): string {
    if (results.length === 0) return 'No results found.';

    return results
      .map((r, i) => {
        const header = `[${i + 1}] ${r.title} (${r.docPath}) — score: ${r.finalScore.toFixed(4)}`;
        if (level === 'brief') return header;

        const lines = [header];
        if (r.headingPath) lines.push(`    Path: ${r.headingPath}`);
        lines.push(`    Snippet: ${r.snippet ?? r.text?.slice(0, 200) ?? ''}`);

        if (level === 'full' && r.text) {
          lines.push('    ---');
          lines.push(r.text.split('\n').map((l) => `    ${l}`).join('\n'));
        }
        return lines.join('\n');
      })
      .join('\n\n');
  }

  /** 將任意物件平展為人類可讀文字 */
  private flattenToText(data: unknown, indent: number = 0): string {
    if (data === null || data === undefined) return '';
    if (typeof data !== 'object') return String(data);

    const prefix = '  '.repeat(indent);
    if (Array.isArray(data)) {
      return data.map((item, i) => `${prefix}[${i}] ${this.flattenToText(item, indent + 1)}`).join('\n');
    }

    return Object.entries(data as Record<string, unknown>)
      .map(([key, val]) => {
        if (typeof val === 'object' && val !== null) {
          return `${prefix}${key}:\n${this.flattenToText(val, indent + 1)}`;
        }
        return `${prefix}${key}: ${val}`;
      })
      .join('\n');
  }
}
