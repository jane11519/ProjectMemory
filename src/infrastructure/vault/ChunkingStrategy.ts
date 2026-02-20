const HEADING_RE = /^(#{1,6})\s+(.*)\s*$/;

/** 預設分切閾值（較保守，適應 CJK/Markdown 的 token 估算誤差） */
const DEFAULT_SPLIT_THRESHOLD = 1500;

export interface RawChunk {
  docPath: string;
  chunkIndex: number;
  headingPath: string;
  startLine: number;
  endLine: number;
  text: string;
}

/**
 * Heading-based chunking：以 Markdown heading 作為切分點，
 * 超過 splitThresholdTokens 的段落再按段落二次切分。
 * 會正確忽略 code block 內的 heading-like 行。
 */
export class ChunkingStrategy {
  private readonly splitChars: number;

  constructor(splitThresholdTokens: number = DEFAULT_SPLIT_THRESHOLD) {
    // token 估算：1 token ≈ 4 chars
    this.splitChars = splitThresholdTokens * 4;
  }

  chunkByHeadings(docPath: string, body: string): RawChunk[] {
    if (!body.trim()) return [];

    const lines = body.split('\n');
    const headingStack: Array<{ level: number; title: string }> = [];
    const headingChunks: RawChunk[] = [];

    let segStart = 0;
    let segHeadingPath = '';
    let chunkIndex = 0;
    let inCodeBlock = false;

    const currentHeadingPath = (): string =>
      headingStack.map((h) => h.title).join(' / ');

    const flush = (segEnd: number): void => {
      const text = lines.slice(segStart, segEnd).join('\n').trim();
      if (text) {
        headingChunks.push({
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

    // 二次切分超大 chunks
    return this.splitOversized(headingChunks);
  }

  /**
   * 超大 chunk 二次切分：先按空行（段落）分割，
   * 逐段累積直到接近閾值再 flush。
   */
  private splitOversized(chunks: RawChunk[]): RawChunk[] {
    const result: RawChunk[] = [];
    let globalIndex = 0;

    for (const chunk of chunks) {
      if (chunk.text.length <= this.splitChars) {
        result.push({ ...chunk, chunkIndex: globalIndex++ });
        continue;
      }

      const paragraphs = chunk.text.split(/\n\n+/);
      let buffer = '';
      let bufStartLine = chunk.startLine;
      let linesSoFar = 0;

      const flushBuffer = (): void => {
        const trimmed = buffer.trim();
        if (!trimmed) return;
        const bufLines = buffer.split('\n').length;
        result.push({
          docPath: chunk.docPath,
          chunkIndex: globalIndex++,
          headingPath: chunk.headingPath,
          startLine: bufStartLine,
          endLine: bufStartLine + bufLines - 1,
          text: trimmed,
        });
      };

      for (const para of paragraphs) {
        const paraLines = para.split('\n').length;
        const candidate = buffer ? `${buffer}\n\n${para}` : para;

        if (buffer && candidate.length > this.splitChars) {
          flushBuffer();
          buffer = para;
          linesSoFar += buffer.split('\n').length + 1;
          bufStartLine = chunk.startLine + linesSoFar - paraLines;
        } else {
          buffer = candidate;
        }
      }

      flushBuffer();
    }

    return result;
  }
}
