import { extractLinks, hostOf, isIpLiteralHost, isPunycodeHost, baseDomain, looksLikeDomain } from '../utils/parse.js';

// Well-known link shorteners. Legitimate, but they hide the true destination,
// which is why phishing likes them.
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'rb.gy', 'shorturl.at'
]);

// Words in a URL path that suggest a credential-harvesting landing page.
const CREDENTIAL_KEYWORDS = /(verify|login|signin|sign-in|account|password|secure|update|confirm|unlock|billing)/i;

/**
 * Link-based signals. Phishing almost always hinges on a malicious link, so a
 * lot of the signal lives here. We inspect link structure only — we never fetch.
 */
export function urlSignals(email) {
  const signals = [];
  const links = extractLinks(email.bodyHtml);
  if (links.length === 0) return signals;

  let ip = 0, shortener = 0, punycode = 0, credential = 0;
  const mismatches = []; // { text, host } — kept so the finding can name names

  for (const link of links) {
    const host = hostOf(link.href);
    if (!host) continue;

    // Anchor text advertises one domain, but href points to a DIFFERENT
    // ORGANIZATION (compared at the base-domain level — a link labeled
    // "update.strava.com" pointing at "strava.com", or vice versa, is normal
    // and not flagged; only a genuinely different organization is).
    // looksLikeDomain() guards against prose like "click here." being
    // mistaken for a displayed URL just because it ends in a period.
    if (looksLikeDomain(link.text)) {
      const cleanedText = link.text.trim().replace(/[.,;:!?]+$/, '');
      const textHost = hostOf(cleanedText.startsWith('http') ? cleanedText : 'http://' + cleanedText);
      if (textHost && baseDomain(host) !== baseDomain(textHost)) {
        mismatches.push({ text: link.text.trim(), host });
      }
    }

    if (isIpLiteralHost(host)) ip++;
    if (SHORTENERS.has(host)) shortener++;
    if (isPunycodeHost(host)) punycode++;
    if (CREDENTIAL_KEYWORDS.test(link.href)) credential++;
  }

  if (mismatches.length > 0) {
    // Name the actual mismatched pair(s) — a verdict a user can't verify
    // themselves isn't really "explainable".
    const examples = mismatches.slice(0, 2).map((m) => `"${m.text}" -> ${m.host}`).join(', ');
    const more = mismatches.length > 2 ? ` (+${mismatches.length - 2} more)` : '';
    signals.push({
      name: 'link-text-mismatch',
      severity: 'high',
      detail: `${mismatches.length} link(s) display one address but point elsewhere: ${examples}${more}.`,
      points: Math.min(25, mismatches.length * 15)
    });
  }
  if (ip > 0) {
    signals.push({
      name: 'ip-url',
      severity: 'high',
      detail: `${ip} link(s) point directly to an IP address instead of a domain.`,
      points: Math.min(20, ip * 15)
    });
  }
  if (punycode > 0) {
    signals.push({
      name: 'punycode-url',
      severity: 'high',
      detail: `${punycode} link(s) use punycode domains — possible look-alike sites.`,
      points: Math.min(20, punycode * 15)
    });
  }
  if (shortener > 0) {
    signals.push({
      name: 'url-shortener',
      severity: 'low',
      detail: `${shortener} shortened link(s) hide their true destination.`,
      points: Math.min(12, shortener * 6)
    });
  }
  if (credential > 0) {
    signals.push({
      name: 'credential-link',
      severity: 'medium',
      detail: `${credential} link(s) reference login/verification actions.`,
      points: Math.min(12, credential * 6)
    });
  }

  return signals;
}
