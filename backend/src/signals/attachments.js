/**
 * Attachment signals based on file metadata (name, type) only. We never open or
 * execute the attachment — we reason about what it *claims* to be.
 */

const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'scr', 'com', 'pif', 'bat', 'cmd', 'js', 'jse', 'vbs', 'vbe', 'wsf',
  'hta', 'jar', 'msi', 'ps1', 'reg', 'lnk'
]);
const MACRO_OFFICE = new Set(['docm', 'xlsm', 'pptm', 'dotm', 'xltm']);
const ARCHIVES = new Set(['zip', 'rar', '7z', 'gz', 'iso', 'img']);

function extOf(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function attachmentSignals(email) {
  const signals = [];
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];

  for (const att of attachments) {
    const name = String(att.name || '');
    const ext = extOf(name);
    const parts = name.toLowerCase().split('.');

    if (DANGEROUS_EXTENSIONS.has(ext)) {
      // A benign-looking extension before the executable one (invoice.pdf.exe)
      // is a deliberate disguise — score it higher.
      const disguised = parts.length >= 3;
      signals.push({
        name: disguised ? 'double-extension' : 'dangerous-attachment',
        severity: 'high',
        detail: disguised
          ? `Attachment "${name}" hides an executable behind a double extension.`
          : `Attachment "${name}" is an executable file type (.${ext}).`,
        points: disguised ? 35 : 30
      });
    } else if (MACRO_OFFICE.has(ext)) {
      signals.push({
        name: 'macro-attachment',
        severity: 'high',
        detail: `Attachment "${name}" is a macro-enabled Office file (.${ext}).`,
        points: 20
      });
    } else if (ARCHIVES.has(ext)) {
      signals.push({
        name: 'archive-attachment',
        severity: 'low',
        detail: `Attachment "${name}" is an archive whose contents can't be inspected here.`,
        points: 8
      });
    }
  }

  return signals;
}
