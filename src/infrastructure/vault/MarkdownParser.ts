import matter from 'gray-matter';

export interface ParsedMarkdown {
  frontmatter: Record<string, any>;
  body: string;
}

export class MarkdownParser {
  parse(rawMarkdown: string): ParsedMarkdown {
    if (!rawMarkdown.trim()) {
      return { frontmatter: {}, body: '' };
    }
    const { data, content } = matter(rawMarkdown);
    return {
      frontmatter: data ?? {},
      body: content ?? '',
    };
  }
}
