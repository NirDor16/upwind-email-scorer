import { getHeader } from '../utils/parse.js';

/**
 * Email authentication signals (SPF / DKIM / DMARC).
 *
 * The receiving mail server records these checks in the "Authentication-Results"
 * header. Failing or missing authentication is one of the strongest indicators
 * that a sender address has been forged.
 */
export function authSignals(email) {
  const signals = [];
  const authResults = getHeader(email.rawHeaders, 'Authentication-Results').toLowerCase();
  const receivedSpf = getHeader(email.rawHeaders, 'Received-SPF').toLowerCase();

  if (!authResults && !receivedSpf) {
    signals.push({
      name: 'auth-missing',
      severity: 'medium',
      detail: 'No authentication results found — the sender could not be verified.',
      points: 10
    });
    return signals;
  }

  const check = (mechanism, failPoints) => {
    const passed = authResults.includes(`${mechanism}=pass`);
    const failed = authResults.includes(`${mechanism}=fail`) ||
                   authResults.includes(`${mechanism}=softfail`);
    if (failed) {
      signals.push({
        name: `${mechanism}-fail`,
        severity: 'high',
        detail: `${mechanism.toUpperCase()} authentication failed — the sender is likely forged.`,
        points: failPoints
      });
    } else if (!passed) {
      signals.push({
        name: `${mechanism}-none`,
        severity: 'low',
        detail: `${mechanism.toUpperCase()} result missing — the sender could not be confirmed.`,
        points: Math.round(failPoints / 3)
      });
    }
  };

  // DMARC is the strongest single signal, then SPF, then DKIM.
  check('dmarc', 25);
  check('spf', 15);
  check('dkim', 10);

  return signals;
}
