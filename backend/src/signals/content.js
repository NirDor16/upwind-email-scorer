/**
 * Content / social-engineering signals from the email text. Individually these
 * are weak, but they matter in combination (e.g. urgency + a credential link).
 */
const PATTERNS = [
  {
    name: 'urgency',
    severity: 'low',
    points: 8,
    detail: 'Uses urgency or pressure language to rush the reader.',
    re: /\b(urgent|immediately|right away|act now|final notice|expires? (today|soon)|within \d+ ?hours?|suspend(ed)?)\b/i
  },
  {
    name: 'credential-request',
    severity: 'medium',
    points: 12,
    detail: 'Asks the reader to log in, verify, or confirm account details.',
    re: /\b(verify your (account|identity)|confirm your (password|account)|update your (payment|billing)|log ?in to (your )?account|re-?activate)\b/i
  },
  {
    name: 'financial-lure',
    severity: 'medium',
    points: 10,
    detail: 'Promises money, prizes, refunds, or similar incentives.',
    re: /\b(you (have )?won|prize|lottery|refund|gift card|claim your|inheritance|wire transfer|crypto payment)\b/i
  },
  {
    name: 'threat',
    severity: 'medium',
    points: 10,
    detail: 'Threatens negative consequences (account closure, legal action).',
    re: /\b(account (will be )?(closed|terminated|suspended|locked)|legal action|lawsuit|penalty|unauthorized (access|login))\b/i
  }
];

export function contentSignals(email) {
  const signals = [];
  const text = [email.subject || '', email.bodyPlain || ''].join('\n');
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      signals.push({ name: p.name, severity: p.severity, detail: p.detail, points: p.points });
    }
  }
  return signals;
}
