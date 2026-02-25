/** Jaskier Shared Pattern — clipboard utility */

/**
 * Copy text to clipboard with graceful fallback.
 *
 * 1. Tries the modern `navigator.clipboard.writeText` API (requires secure context).
 * 2. Falls back to a hidden textarea + `execCommand('copy')` for insecure contexts
 *    (e.g. plain HTTP on non-localhost origins).
 *
 * @returns `true` if copy succeeded, `false` otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Modern Clipboard API — works in secure contexts (HTTPS / localhost)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or other error — try fallback below
    }
  }

  // Legacy fallback — textarea + execCommand (deprecated but still functional)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
