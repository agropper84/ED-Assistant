/**
 * Verify markdown links in AI-generated text.
 * Checks each [text](url) link with a HEAD request.
 * Replaces broken links with just the text (no hyperlink).
 */

const TIMEOUT_MS = 5000;
const MAX_CONCURRENT = 5;

/** Extract all markdown links from text */
function extractLinks(text: string): { full: string; label: string; url: string }[] {
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const links: { full: string; label: string; url: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    links.push({ full: match[0], label: match[1], url: match[2] });
  }
  return links;
}

/** Check if a URL is reachable (HEAD request with timeout) */
async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)',
      },
    });

    clearTimeout(timeout);

    // Accept 2xx and 3xx as valid
    return res.status < 400;
  } catch {
    return false;
  }
}

/** Verify all links in text, replacing broken ones with plain text */
export async function verifyLinks(text: string): Promise<string> {
  const links = extractLinks(text);
  if (links.length === 0) return text;

  // Deduplicate URLs
  const uniqueUrls = Array.from(new Set(links.map(l => l.url)));

  // Check URLs in batches
  const results = new Map<string, boolean>();
  for (let i = 0; i < uniqueUrls.length; i += MAX_CONCURRENT) {
    const batch = uniqueUrls.slice(i, i + MAX_CONCURRENT);
    const checks = await Promise.all(
      batch.map(async url => ({
        url,
        valid: await isUrlReachable(url),
      }))
    );
    for (const { url, valid } of checks) {
      results.set(url, valid);
    }
  }

  // Replace broken links with just the label text
  let result = text;
  for (const link of links) {
    if (!results.get(link.url)) {
      result = result.replace(link.full, link.label);
    }
  }

  return result;
}
