export async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); return; } catch { /* Older browsers and insecure contexts need the selection fallback. */ }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea'); field.value = text; field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-9999px;top:0'; field.setAttribute('aria-hidden', 'true');
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally { field.remove(); previous?.focus({ preventScroll: true }); }
}
