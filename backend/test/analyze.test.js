import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEmail } from '../src/analyze.js';

test('a benign, fully-authenticated email scores Safe', () => {
  const result = analyzeEmail({
    subject: 'Lunch tomorrow?',
    from: 'Alice <alice@company.com>',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass',
    bodyPlain: 'Want to grab lunch tomorrow at noon?',
    bodyHtml: '<p>Want to grab lunch tomorrow at noon?</p>'
  });
  assert.equal(result.band, 'Safe');
  assert.ok(result.score < 25, `expected low score, got ${result.score}`);
});

test('a spoofed brand + auth failure + IP link scores high', () => {
  const result = analyzeEmail({
    subject: 'Your PayPal account will be suspended - verify now',
    from: 'PayPal Support <security@paypa1-alerts.ru>',
    replyTo: 'noreply@random-inbox.top',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=fail; dkim=fail; dmarc=fail',
    bodyPlain: 'Verify your account immediately or it will be suspended.',
    bodyHtml: '<a href="http://192.0.2.10/verify-login">https://paypal.com/account</a>'
  });
  assert.ok(result.score >= 50, `expected high score, got ${result.score}`);
  assert.ok(['Likely Malicious', 'Malicious'].includes(result.band));
});

test('a dangerous double-extension attachment is flagged', () => {
  const result = analyzeEmail({
    subject: 'Invoice attached',
    from: 'billing@vendor.com',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass',
    attachments: [{ name: 'invoice.pdf.exe', contentType: 'application/octet-stream', size: 1024 }]
  });
  const names = result.signals.map((s) => s.name);
  assert.ok(names.includes('double-extension'));
});

test('malformed / empty input does not throw', () => {
  assert.doesNotThrow(() => analyzeEmail(null));
  assert.doesNotThrow(() => analyzeEmail({ from: 12345, attachments: 'nope' }));
});
