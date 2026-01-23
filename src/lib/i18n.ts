import { STRINGS, type Locale } from './strings.js';

export type { Locale };

/**
 * Simple check for 'en' in the system locale string.
 */
export function detectLocale(): Locale {
  const envLocale = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';
  // Node.js environments often have Intl
  let intlLocale = '';
  try {
     intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch (e) {
    // Ignore
  }
  
  if (envLocale.toLowerCase().startsWith('en') || intlLocale.toLowerCase().startsWith('en')) {
    return 'en';
  }
  
  return 'jp';
}

let currentLocale: Locale = detectLocale();

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Fetch the localized string from STRINGS dict with safe fallback for missing strings. 
 */
export function str(key: string): string {
  return STRINGS[key]?.[currentLocale] || key;
}

