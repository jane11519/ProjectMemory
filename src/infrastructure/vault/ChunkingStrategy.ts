const HEADING_RE = /^(#{1,6})\s+(.*)\s*$/;

export interface RawChunk {
  docPath: string;
  chunkIndex: number;
  headingPath: string;
  startLine: number;
  endLine: number;
  text: string;
}

/**
 * Heading-based chunking：以 Markdown heading 作為切分點
 * 會正確忽略 code block 內的 heading-like 行
 */
export class ChunkingStrategy {
  chunkByHeadings(docPath: string, body: string): RawChunk[] {
    if (!body.trim()) return [];

    const lines = body.split('\n');
    const headingStack: Array<{ level: number; title: string }> = [];
    const chunks: RawChunk[] = [];

    let segStart = 0;
    let segHeadingPath = '';
    let chunkIndex = 0;
    let inCodeBlock = false;

    const currentHeadingPath = (): string =>
      headingStack.map((h) => h.title).join(' / ');

    const flush = (segEnd: number): void => {
      const text = lines.slice(segStart, segEnd).join('\n').trim();
      if (text) {
        chunks.push({
          docPath,
          chunkIndex,
          headingPath: segHeadingPath,
          startLine: segStart + 1, // 1-based
          endLine: segEnd,
          text,
        });
        chunkIndex++;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 追蹤 code block 邊界
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const match = HEADING_RE.exec(line);
      if (match) {
        flush(i);

        const level = match[1].length;
        const title = match[2].trim();

        while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop();
        }
        headingStack.push({ level, title });

        segStart = i;
        segHeadingPath = currentHeadingPath();
      }
    }

    // 最後一段
    flush(lines.length);
    return chunks;
  }
}
