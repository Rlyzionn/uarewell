// Parses the delimiter-separated blog format produced by BLOG_WRITER_SYSTEM.
// Falls back to JSON parsing if the model still returned JSON despite the instructions.

const CATEGORIES = [
  'NLP & Mindset', 'Trauma & Healing', 'Relationships',
  'Addiction & Recovery', 'Spiritual Growth', 'Anxiety & Depression',
  'Parenting & Family', 'General',
];

function stripFences(s) {
  return String(s || '').trim().replace(/^```(?:json|markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function extractSection(text, name) {
  const re = new RegExp(`(?:^|\\n)===${name}===[\\t ]*\\n([\\s\\S]*?)(?=\\n===[A-Z]+===\\s*\\n|$)`);
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

export function parseBlogDraft(raw, fallbackCategory = 'General') {
  const cleaned = stripFences(raw);

  // Preferred: delimiter format
  if (cleaned.includes('===TITLE===')) {
    const title = extractSection(cleaned, 'TITLE');
    const excerpt = extractSection(cleaned, 'EXCERPT');
    const category = extractSection(cleaned, 'CATEGORY');
    const body = extractSection(cleaned, 'BODY');
    if (title && body) {
      return {
        title,
        excerpt,
        body,
        category: CATEGORIES.includes(category) ? category : fallbackCategory,
      };
    }
  }

  // Fallback: JSON
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || '').trim(),
      excerpt: String(parsed.excerpt || '').trim(),
      body: String(parsed.body || '').trim(),
      category: CATEGORIES.includes(parsed.category) ? parsed.category : fallbackCategory,
    };
  } catch {
    // Last-ditch fallback: treat the whole output as the body, fabricate a title from the first line.
    const firstLine = cleaned.split('\n').find(l => l.trim()) || 'Untitled Post';
    return {
      title: firstLine.replace(/^#+\s*/, '').slice(0, 120),
      excerpt: '',
      body: cleaned,
      category: fallbackCategory,
    };
  }
}

export { CATEGORIES };
