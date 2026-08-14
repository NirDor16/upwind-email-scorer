/**
 * Small parsing helpers shared by the signal modules.
 *
 * Everything here operates on UNTRUSTED input (an attacker-controlled email).
 * These functions only read and pattern-match — they never evaluate content,
 * follow links, or make network calls.
 */

// Common free email providers. Mail from these is perfectly normal, but a
// display name that impersonates a well-known brand while sending from freemail
// is a classic phishing tell.
const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
  'aol.com', 'icloud.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com'
]);

// A handful of brands frequently impersonated in phishing. Not exhaustive — in
// production this would be a maintained list / threat-intel feed.
const IMPERSONATED_BRANDS = [
  'paypal', 'microsoft', 'apple', 'amazon', 'google', 'netflix', 'facebook',
  'instagram', 'linkedin', 'dhl', 'fedex', 'ups', 'wellsfargo', 'chase',
  'coinbase', 'binance', 'dropbox', 'docusign'
];

/** Parse "Display Name <addr@domain>" into its parts. */
export function parseAddress(raw) {
  if (typeof raw !== 'string') return { display: '', email: '', domain: '' };
  const match = raw.match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim().toLowerCase();
  const display = (match ? raw.slice(0, match.index) : '').replace(/"/g, '').trim();
  const domain = email.includes('@') ? email.split('@').pop() : '';
  return { display, email, domain };
}

/** Read a single header value from a raw header block (case-insensitive). */
export function getHeader(rawHeaders, name) {
  if (typeof rawHeaders !== 'string') return '';
  // Headers can be "folded" across multiple lines; join continuations first.
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const re = new RegExp('^' + name + ':\\s*(.*)$', 'im');
  const m = unfolded.match(re);
  return m ? m[1].trim() : '';
}

/** Extract links from an HTML body as { href, text } pairs (bounded). */
export function extractLinks(html) {
  if (typeof html !== 'string') return [];
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let m;
  while ((m = re.exec(html)) !== null && links.length < 200) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').trim(); // strip inner tags
    links.push({ href, text });
  }
  return links;
}

/**
 * Convert an HTML body to readable text. Many emails keep their meaningful copy
 * only in the HTML part (the text/plain part can be short or missing), so content
 * analysis must look here too. We strip tags — we never render or execute the HTML.
 */
export function htmlToText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ') // drop scripts/styles entirely
    .replace(/<[^>]+>/g, ' ')                         // strip remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hostname of a URL, lowercased. Returns '' if it can't be parsed. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isFreemail(domain) {
  return FREEMAIL_DOMAINS.has(domain);
}

/** True for URLs whose host is a raw IP address (e.g. http://192.0.2.1/...). */
export function isIpLiteralHost(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
}

/** True for internationalized/punycode hosts (xn--...), used in look-alikes. */
export function isPunycodeHost(host) {
  return host.split('.').some((label) => label.startsWith('xn--'));
}

/** If the display name name-drops a brand the sender domain doesn't belong to. */
export function brandImpersonated(displayName, fromDomain) {
  const dn = (displayName || '').toLowerCase();
  const domain = fromDomain || '';
  for (const brand of IMPERSONATED_BRANDS) {
    if (dn.includes(brand) && !domain.includes(brand)) return brand;
  }
  return '';
}

export { FREEMAIL_DOMAINS, IMPERSONATED_BRANDS };
