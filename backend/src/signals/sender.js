import { parseAddress, isPunycodeHost, brandImpersonated, baseDomain } from '../utils/parse.js';

/**
 * Sender-identity signals: does the "From" line look like who it claims to be?
 */
export function senderSignals(email) {
  const signals = [];
  const from = parseAddress(email.from);
  const replyTo = parseAddress(email.replyTo);

  // Display name name-drops a known brand, but the address isn't that brand.
  const brand = brandImpersonated(from.display, from.domain);
  if (brand) {
    signals.push({
      name: 'brand-spoof',
      severity: 'high',
      detail: `Display name mentions "${brand}" but the address is ${from.email || 'unknown'}.`,
      points: 20
    });
  }

  // Replies would silently go to a DIFFERENT ORGANIZATION than the sender.
  // Compared at the organization level (baseDomain), not the exact hostname,
  // because "update.strava.com" replying via "strava.com" is normal ESP
  // practice, not spoofing — only a genuinely different organization is a signal.
  if (replyTo.domain && from.domain && baseDomain(replyTo.domain) !== baseDomain(from.domain)) {
    signals.push({
      name: 'replyto-mismatch',
      severity: 'medium',
      detail: `Replies would go to ${replyTo.domain}, a different organization than the sender's domain ${from.domain}.`,
      points: 10
    });
  }

  // Punycode/IDN sender domain — a common homograph look-alike technique.
  if (isPunycodeHost(from.domain)) {
    signals.push({
      name: 'punycode-sender',
      severity: 'high',
      detail: `Sender domain uses punycode (${from.domain}) — often a look-alike of a real domain.`,
      points: 20
    });
  }

  return signals;
}
