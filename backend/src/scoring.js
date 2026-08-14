/**
 * Turns a flat list of signals into a bounded score and a verdict band.
 *
 * The score is a transparent, capped sum of signal points — deliberately not an
 * ML model. Every point is traceable to a named signal, which is what makes the
 * verdict explainable.
 */
const BANDS = [
  { min: 75, band: 'Malicious',        verdict: 'This email shows strong signs of being malicious.' },
  { min: 50, band: 'Likely Malicious', verdict: 'This email has several suspicious traits; treat it with caution.' },
  { min: 25, band: 'Suspicious',       verdict: 'Some traits here are worth a second look before you trust it.' },
  { min: 0,  band: 'Safe',             verdict: 'Nothing notably suspicious was detected.' }
];

export function scoreSignals(signals) {
  const raw = signals.reduce((sum, s) => sum + (s.points || 0), 0);
  const score = Math.max(0, Math.min(100, raw));
  const { band, verdict } = BANDS.find((b) => score >= b.min);
  return { score, band, verdict };
}
