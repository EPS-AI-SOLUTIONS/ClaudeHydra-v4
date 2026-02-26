/**
 * Locale-aware formatting utilities.
 * Uses navigator.language (or i18next current language) instead of hardcoded 'en-US'.
 *
 * #49 Locale-aware formatting
 */

import i18next from 'i18next';

/** Returns the user's preferred locale (i18next > navigator > fallback) */
export function getLocale(): string {
  return i18next.language || navigator.language || 'en-US';
}

/** Format a date to a locale-aware date+time string */
export function formatDateTime(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(getLocale());
}

/** Format a date to a locale-aware time-only string */
export function formatTime(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString(getLocale());
}

/** Format a date to a locale-aware date-only string */
export function formatDate(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(getLocale());
}

/** Format a number to a locale-aware string */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), options).format(value);
}
