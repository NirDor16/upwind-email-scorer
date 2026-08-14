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
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('Subject')
    .setContent(escapeText_(message.getSubject() || '(no subject)')));
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('From')
    .setContent(escapeText_(message.getFrom() || '(unknown)')));

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

  return buildResultCard_(result);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function buildResultCard_(result) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Analysis Result'));

  const section = CardService.newCardSection();
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('Score')
    .setContent(String(result.score) + ' / 100'));
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('Verdict')
    .setContent(escapeText_(result.band || '')));

  if (result.explanation) {
    section.addWidget(CardService.newTextParagraph()
      .setText(escapeText_(result.explanation)));
  }

  (result.signals || []).forEach(function (s) {
    section.addWidget(CardService.newKeyValue()
      .setTopLabel(escapeText_(s.name))
      .setContent(escapeText_(s.detail || '')));
  });

  section.addWidget(CardService.newTextParagraph()
    .setText('<i>Advisory only — always use your own judgment.</i>'));

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

function notify_(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .build();
}
