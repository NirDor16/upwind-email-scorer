/**
 * Malicious Email Scorer — Backend service.
 *
 * A small Express app the Gmail Add-on talks to. It receives a description of
 * an opened email, runs the analysis pipeline, and returns a structured result
 * (score + verdict + per-signal reasoning).
 *
 * Security notes:
 *  - The request body is UNTRUSTED input (it describes an attacker-controlled
 *    email). We never execute it, never follow its links, and validate its shape.
 *  - Access is gated by a shared secret so the endpoint is not open to the world.
 */

import express from 'express';
import { analyzeEmail } from './analyze.js';

const app = express();

// Parse JSON bodies, with a hard size cap so a huge payload can't exhaust memory.
app.use(express.json({ limit: '1mb' }));

// The add-on must send this secret in the Authorization header. It lives only in
// environment variables (Render dashboard / local .env), never in the repo.
const SHARED_SECRET = process.env.SHARED_SECRET || '';

function requireAuth(req, res, next) {
  // If no secret is configured (pure local dev), allow through to keep testing simple.
  if (!SHARED_SECRET) return next();

  const header = req.get('authorization') || '';
  const provided = header.replace(/^Bearer\s+/i, '');
  if (provided !== SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

// Health check — used by Render and to "warm up" the free instance before a demo.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Core endpoint: analyze one email.
app.post('/analyze', requireAuth, (req, res) => {
  try {
    const body = req.body ?? {};
    const result = analyzeEmail(body);

    // TEMP DEBUG — shows what the add-on actually delivered. Remove after diagnosis.
    result.signals.unshift({
      name: 'debug-received',
      severity: 'info',
      detail: `rawHeaders=${(body.rawHeaders || '').length} bodyPlain=${(body.bodyPlain || '').length} bodyHtml=${(body.bodyHtml || '').length} attachments=${Array.isArray(body.attachments) ? body.attachments.length : 0}`,
      points: 0
    });

    return res.json(result);
  } catch (err) {
    // Never leak internals or the offending content back to the client.
    console.error('analyze failed:', err.message);
    return res.status(500).json({ error: 'analysis_failed' });
  }
});

// Render provides PORT via the environment; default to 3000 for local dev.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Email scorer backend listening on port ${PORT}`));
