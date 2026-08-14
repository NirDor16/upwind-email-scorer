/**
 * Malicious Email Scorer — Gmail Add-on (UI layer).
 *
 * This file is intentionally "thin": it reacts when the user opens an email,
 * extracts a minimal set of fields, sends them to the backend for analysis,
 * and renders the result as a card. All scoring logic lives in the backend.
 *
 * Configuration lives in Script Properties (Project Settings > Script Properties):
 *   BACKEND_URL    e.g. https://your-service.onrender.com/analyze
 *   SHARED_SECRET  must match the backend's SHARED_SECRET
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    backendUrl: props.getProperty('BACKEND_URL'),
    sharedSecret: props.getProperty('SHARED_SECRET') || ''
  };
}

// ---------------------------------------------------------------------------
// Entry point: runs automatically when an email is opened.
// ---------------------------------------------------------------------------
function onGmailMessageOpen(e) {
  // The add-on gets a scoped, temporary token to read only the current message.
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);

  const messageId = e.gmail.messageId;
  const message = GmailApp.getMessageById(messageId);

  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Malicious Email Scorer'));

  const section = CardService.newCardSection();

  // Email fields are UNTRUSTED — escape before rendering (see escapeText_).
  // Wrapped in forceLtr_ because these are almost always Latin-script (English
  // subjects/addresses); without it, RTL Gmail mirrors "<" / ">" around the
  // sender's email address into the wrong shape.
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('Subject')
    .setContent(forceLtr_(escapeText_(message.getSubject() || '(no subject)')))
    .setMultiline(true));
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('From')
    .setContent(forceLtr_(escapeText_(message.getFrom() || '(unknown)')))
    .setMultiline(true));

  section.addWidget(CardService.newTextButton()
    .setText('Analyze this email')
    .setOnClickAction(CardService.newAction()
      .setFunctionName('runAnalysis')
      .setParameters({ messageId: messageId })));

  card.addSection(section);
  return card.build();
}

// ---------------------------------------------------------------------------
// Action: called when the user clicks "Analyze this email".
// ---------------------------------------------------------------------------
function runAnalysis(e) {
  const config = getConfig_();
  if (!config.backendUrl) {
    return notify_('Backend URL not set. Add BACKEND_URL in Script Properties.');
  }

  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  const message = GmailApp.getMessageById(e.parameters.messageId);

  // The header block is everything before the first blank line of the raw MIME.
  // We send headers only (not the whole raw message) to keep the payload small.
  const rawContent = message.getRawContent() || '';
  const rawHeaders = rawContent.split(/\r?\n\r?\n/)[0] || '';

  // Attachment metadata only — never the file bytes.
  const attachments = message.getAttachments({ includeInlineImages: false }).map(function (a) {
    return { name: a.getName(), contentType: a.getContentType(), size: a.getSize() };
  });

  const payload = {
    subject: message.getSubject() || '',
    from: message.getFrom() || '',
    replyTo: message.getReplyTo() || '',
    rawHeaders: rawHeaders.slice(0, 20000),
    bodyPlain: (message.getPlainBody() || '').slice(0, 20000),
    bodyHtml: (message.getBody() || '').slice(0, 50000),
    attachments: attachments
  };

  let result;
  try {
    const response = UrlFetchApp.fetch(config.backendUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + config.sharedSecret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true // handle errors ourselves instead of throwing
    });

    const code = response.getResponseCode();
    if (code !== 200) {
      return notify_('Backend returned an error (' + code + '). Try again shortly.');
    }
    result = JSON.parse(response.getContentText());
  } catch (err) {
    return notify_('Could not reach the analysis service.');
  }

  const messageId = e.parameters.messageId;
  try {
    // Cache the full result briefly so "Show all findings" can re-render
    // without a second backend call. Caching is a nice-to-have — if it fails
    // (e.g. quota), the button below just degrades to an "expired" notice.
    CacheService.getUserCache().put('analysis_' + messageId, JSON.stringify(result), 1800);
  } catch (err) {
    // ignore — non-critical
  }

  return buildResultCard_(result, messageId, false);
}

// ---------------------------------------------------------------------------
// Action: called when the user clicks "Show all findings".
// ---------------------------------------------------------------------------
function showAllFindings(e) {
  const messageId = e.parameters.messageId;
  const cached = CacheService.getUserCache().get('analysis_' + messageId);
  if (!cached) {
    return notify_('Results expired — click Analyze again to refresh.');
  }
  return buildResultCard_(JSON.parse(cached), messageId, true);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function buildResultCard_(result, messageId, showAll) {
  const band = result.band || '';
  const score = Number(result.score) || 0;

  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle(bandEmoji_(band) + ' Analysis Result')
      .setSubtitle(band));

  const section = CardService.newCardSection();

  // Score — wrapped in LTR embedding marks so "12 / 100" doesn't get visually
  // reordered inside a right-to-left (Hebrew/Arabic) Gmail interface.
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('Score')
    .setContent(forceLtr_(score + ' / 100')));
  section.addWidget(CardService.newTextParagraph().setText(forceLtr_(scoreBar_(score, band))));

  section.addWidget(CardService.newKeyValue()
    .setTopLabel('Verdict')
    .setContent(bandEmoji_(band) + ' ' + forceLtr_(escapeText_(band))));

  if (result.explanation) {
    section.addWidget(CardService.newTextParagraph().setText(forceLtr_(escapeText_(result.explanation))));
    // Clarify what's AI vs. deterministic: only this paragraph above is
    // AI-written; the individual findings listed below are rule-based, not AI.
    const sourceNote = result.explanationSource === 'ai'
      ? 'This summary was written by AI based on the deterministic findings listed below.'
      : 'This summary was generated automatically (AI explanation unavailable) from the findings listed below.';
    section.addWidget(CardService.newTextParagraph().setText('<i>' + forceLtr_(escapeText_(sourceNote)) + '</i>'));
  }

  // Show the strongest findings only by default (already sorted by the
  // backend); a long list is harder to act on than a short, prioritized one.
  // "Show all findings" lets the user expand to the full list on demand.
  // These are all our own English text (fixed strings + ASCII-ish values like
  // domains/filenames), so it's safe — and necessary — to force LTR on them too.
  const allSignals = result.signals || [];
  const shown = showAll ? allSignals : allSignals.slice(0, 5);
  shown.forEach(function (s) {
    section.addWidget(CardService.newKeyValue()
      .setTopLabel(severityEmoji_(s.severity) + ' ' + forceLtr_(escapeText_(humanizeName_(s.name))))
      .setContent(forceLtr_(escapeText_(s.detail || '')))
      .setMultiline(true)); // long English findings must wrap, not truncate to one line
  });
  if (!showAll && allSignals.length > shown.length) {
    section.addWidget(CardService.newTextButton()
      .setText('Show all findings (+' + (allSignals.length - shown.length) + ')')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('showAllFindings')
        .setParameters({ messageId: messageId })));
  } else if (showAll && allSignals.length > 0) {
    section.addWidget(CardService.newTextParagraph()
      .setText(forceLtr_('Showing all ' + allSignals.length + ' finding(s).')));
  }

  section.addWidget(CardService.newTextParagraph()
    .setText('<i>' + forceLtr_('Advisory only — always use your own judgment.') + '</i>'));

  card.addSection(section);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Email content is UNTRUSTED. Escape HTML-significant characters so a crafted
// subject/sender can't inject markup into the card we render.
function escapeText_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Forces a substring to render left-to-right regardless of the surrounding
// interface language (fixes "12 / 100" showing as "100 / 12" in Hebrew Gmail).
// Built from character codes at runtime (not pasted as literal invisible
// characters) so copy-pasting this file never corrupts them.
function forceLtr_(text) {
  const LRE = String.fromCharCode(8234); // LEFT-TO-RIGHT EMBEDDING
  const PDF = String.fromCharCode(8236); // POP DIRECTIONAL FORMATTING
  return LRE + text + PDF;
}

function bandEmoji_(band) {
  switch (band) {
    case 'Safe': return '🟢';
    case 'Suspicious': return '🟡';
    case 'Likely Malicious': return '🟠';
    case 'Malicious': return '🔴';
    default: return '⚪';
  }
}

// Turns an internal signal id like "credential-request" into "Credential request".
function humanizeName_(name) {
  const s = String(name || '').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function severityEmoji_(severity) {
  switch (severity) {
    case 'high': return '🔴';
    case 'medium': return '🟠';
    case 'low': return '🟡';
    default: return 'ℹ️';
  }
}

// A simple 10-segment text "gauge" colored by band, e.g. 🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜ for score 30.
function scoreBar_(score, band) {
  const fillChar = { Safe: '🟩', Suspicious: '🟨', 'Likely Malicious': '🟧', Malicious: '🟥' }[band] || '⬛';
  const filled = Math.max(0, Math.min(10, Math.round(score / 10)));
  let bar = '';
  for (let i = 0; i < 10; i++) bar += (i < filled ? fillChar : '⬜');
  return bar;
}

function notify_(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('⚠️ ' + text))
    .build();
}
