/**
 * Analysis engine.
 *
 * M1 (current): a stub that returns a fixed result. Its only job right now is to
 * prove the full pipeline works end-to-end: Add-on -> backend -> card.
 *
 * M3 will replace the body with the real, deterministic signal pipeline
 * (sender / auth / URL / attachment / content signals -> weighted score).
 * M4 will add an OpenAI layer that *explains* the result in natural language,
 * without ever changing the numeric score.
 *
 * @param {object} email - Untrusted description of the opened email.
 * @returns {{score:number, band:string, verdict:string, signals:Array, explanation:string}}
 */
export function analyzeEmail(email) {
  const subject = typeof email.subject === 'string' ? email.subject : '';

  return {
    score: 42,
    band: 'Suspicious',
    verdict: 'Placeholder verdict from the M1 skeleton.',
    signals: [
      {
        name: 'skeleton',
        severity: 'info',
        detail: `Backend reached. Received subject: "${subject.slice(0, 80)}"`,
        points: 42
      }
    ],
    explanation: 'Skeleton response — the real analysis engine is added in a later milestone.'
  };
}
