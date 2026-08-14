import { authSignals } from './signals/auth.js';
import { senderSignals } from './signals/sender.js';
import { urlSignals } from './signals/urls.js';
import { attachmentSignals } from './signals/attachments.js';
import { contentSignals } from './signals/content.js';
import { scoreSignals } from './scoring.js';

/**
 * Orchestrates the deterministic analysis pipeline.
 *
 * Each module inspects the (untrusted) email and returns zero or more signals;
 * the scorer turns them into a bounded score + verdict band. The signals are
 * sorted strongest-first so the UI and the explanation can lead with what matters.
 *
 * A natural-language explanation layer (OpenAI) is added in M4 and will replace
 * buildBasicExplanation() — but it only rephrases these signals, it never
 * changes the score.
 *
 * @param {object} email - Untrusted description of the opened email.
 */
export function analyzeEmail(email) {
  const safe = normalize(email);

  const signals = [
    ...authSignals(safe),
    ...senderSignals(safe),
    ...urlSignals(safe),
    ...attachmentSignals(safe),
    ...contentSignals(safe)
  ].sort((a, b) => (b.points || 0) - (a.points || 0));

  const { score, band, verdict } = scoreSignals(signals);

  return {
    score,
    band,
    verdict,
    signals,
    explanation: buildBasicExplanation(signals)
  };
}

/**
 * Coerce every field to a known-safe shape and bound its size, so a malformed or
 * hostile payload can't crash a downstream module or blow up memory.
 */
function normalize(email) {
  const e = email && typeof email === 'object' ? email : {};
  return {
    subject: str(e.subject).slice(0, 2000),
    from: str(e.from).slice(0, 500),
    replyTo: str(e.replyTo).slice(0, 500),
    rawHeaders: str(e.rawHeaders).slice(0, 20000),
    bodyPlain: str(e.bodyPlain).slice(0, 20000),
    bodyHtml: str(e.bodyHtml).slice(0, 50000),
    attachments: Array.isArray(e.attachments) ? e.attachments.slice(0, 25) : []
  };
}

function str(v) {
  return typeof v === 'string' ? v : '';
}

function buildBasicExplanation(signals) {
  if (signals.length === 0) return 'No suspicious signals were detected in this email.';
  const top = signals.slice(0, 3).map((s) => s.detail);
  return 'Key findings: ' + top.join(' ');
}
