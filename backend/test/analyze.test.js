import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEmail } from '../src/analyze.js';

test('a benign, fully-authenticated email scores Safe', async () => {
  const result = await analyzeEmail({
    subject: 'Lunch tomorrow?',
    from: 'Alice <alice@company.com>',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass',
    bodyPlain: 'Want to grab lunch tomorrow at noon?',
    bodyHtml: '<p>Want to grab lunch tomorrow at noon?</p>'
  });
  assert.equal(result.band, 'Safe');
  assert.ok(result.score < 25, `expected low score, got ${result.score}`);
});

test('a spoofed brand + auth failure + IP link scores high', async () => {
  const result = await analyzeEmail({
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

test('a dangerous double-extension attachment is flagged', async () => {
  const result = await analyzeEmail({
    subject: 'Invoice attached',
    from: 'billing@vendor.com',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass',
    attachments: [{ name: 'invoice.pdf.exe', contentType: 'application/octet-stream', size: 1024 }]
  });
  const names = result.signals.map((s) => s.name);
  assert.ok(names.includes('double-extension'));
});

test('content signals are detected in the HTML body, not just the plain body', async () => {
  // Regression: some emails keep the meaningful copy only in the HTML part.
  const result = await analyzeEmail({
    subject: 'Sudo email verification [GitHub]',
    from: 'GitHub <noreply@github.com>',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass',
    bodyPlain: 'Here is your code: 123456. Valid for 15 minutes.',
    bodyHtml: '<h1>Please verify your identity, NirDor16</h1><p>Here is your code.</p>'
  });
  const names = result.signals.map((s) => s.name);
  assert.ok(names.includes('credential-request'), 'expected credential-request from HTML body');
});

test('same-organization subdomains (ESP pattern) are not flagged as mismatches', async () => {
  // Regression: legitimate senders commonly send from a subdomain and reply/
  // link through the parent domain (or another subdomain) of the SAME org.
  const result = await analyzeEmail({
    subject: 'What a week!',
    from: 'Strava <mail@update.strava.com>',
    replyTo: 'noreply@strava.com',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass',
    bodyPlain: 'Check your weekly stats.',
    bodyHtml: '<a href="https://links.strava.com/track?u=abc">www.strava.com</a>'
  });
  const names = result.signals.map((s) => s.name);
  assert.ok(!names.includes('replyto-mismatch'), 'same-org reply-to should not be flagged');
  // Note: links.strava.com and www.strava.com share the base domain strava.com,
  // so this should not be flagged as a mismatch either.
  assert.ok(!names.includes('link-text-mismatch'), 'same-org link should not be flagged');
});

test('reply-to pointing at a genuinely different organization is still flagged', async () => {
  const result = await analyzeEmail({
    subject: 'Invoice',
    from: 'Billing <billing@vendor.com>',
    replyTo: 'reply@totally-different-company.com',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass'
  });
  const names = result.signals.map((s) => s.name);
  assert.ok(names.includes('replyto-mismatch'));
});

test('ordinary prose ending in a period ("click here.") is not a link mismatch', async () => {
  // Regression: a real ATS/recruiting email with a "here." link and a
  // "Checkout.com" -> tracking-domain link. Only the genuine domain-looking
  // text should be flagged; "here." is prose, not a displayed URL.
  const result = await analyzeEmail({
    subject: 'Action required: consent',
    from: 'Hiring Team <no-reply@ashbyhq.com>',
    rawHeaders: 'Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass',
    bodyHtml:
      '<p>Please review and accept our consent terms by clicking the link <a href="https://you.ashbyhq.com/consent">here.</a></p>' +
      '<p>At <a href="https://you.ashbyhq.com/redirect">Checkout.com</a>, we operate fast.</p>'
  });
  const mismatchSignal = result.signals.find((s) => s.name === 'link-text-mismatch');
  assert.ok(mismatchSignal, 'expected a mismatch finding for the Checkout.com link');
  assert.ok(mismatchSignal.detail.startsWith('1 link(s)'), 'only Checkout.com should count, not "here."');
  assert.ok(mismatchSignal.detail.includes('"Checkout.com"'), 'the real mismatch should name Checkout.com');
  assert.ok(!mismatchSignal.detail.includes('"here.'), '"here." must not be counted as a mismatch');
});

test('malformed / empty input does not throw', async () => {
  await assert.doesNotReject(() => analyzeEmail(null));
  await assert.doesNotReject(() => analyzeEmail({ from: 12345, attachments: 'nope' }));
});
