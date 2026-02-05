// =============================================================================
// CENTRALIZED I18N UTILITIES
// =============================================================================

import i18n from 'i18next';

/**
 * Get text based on current language (hy, ru, en)
 * Replaces duplicated getText() functions across the codebase
 */
export function getText(hy: string, ru: string, en: string): string {
  const lang = i18n.language;
  if (lang === 'hy') return hy;
  if (lang === 'ru') return ru;
  return en;
}

/**
 * Get localized text from an object with hy/ru/en keys
 */
export function getLocalizedText(obj: { hy?: string; ru?: string; en?: string } | null | undefined): string {
  if (!obj) return '';
  const lang = i18n.language;
  if (lang === 'hy' && obj.hy) return obj.hy;
  if (lang === 'ru' && obj.ru) return obj.ru;
  return obj.en || obj.ru || obj.hy || '';
}

/**
 * Get localized name field (name_hy, name_ru, name_en pattern)
 */
export function getLocalizedName(obj: { name_hy?: string; name_ru?: string; name_en?: string } | null | undefined): string {
  if (!obj) return '';
  const lang = i18n.language;
  if (lang === 'hy' && obj.name_hy) return obj.name_hy;
  if (lang === 'ru' && obj.name_ru) return obj.name_ru;
  return obj.name_en || obj.name_ru || obj.name_hy || '';
}
