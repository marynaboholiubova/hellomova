export interface LanguageOption {
  /** Stable identifier — stored in the database, never the display label. */
  code: string;
  /** Display name shown to an English-reading UI for now. */
  name: string;
  /** Name of the language in itself, when it differs meaningfully from `name`. */
  nativeName?: string;
  /** Set when this entry is a dialect/variant of a broader language's code. */
  variantOf?: string;
  /** True if the language is written right-to-left. */
  rtl?: boolean;
}

/**
 * HelloMova's launch catalog — exactly these 50 languages and variants, as
 * specified. Do not add, remove, rename, or substitute entries here without
 * the same explicit sign-off; every picker, the Zod enum in
 * src/lib/onboarding/schemas.ts, and the "See all 50 languages" list all
 * derive their allowed values from this single array.
 *
 * Codes are stable internal identifiers, not display labels. Most use
 * ISO 639-1 where one exists. A few languages in the launch list don't have
 * an ISO 639-1 code (Montenegrin) or need a code ISO 639-1 doesn't offer at
 * all (the five Arabic dialects, which have no standard two-letter code),
 * so those use a readable `<base>-<region>` convention instead — still
 * stable, just not drawn from a single external standard. The five Arabic
 * dialects are modeled as variants of the `ar` (Modern Standard Arabic)
 * entry via `variantOf`, not as unrelated languages.
 */
export const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "bg", name: "Bulgarian", nativeName: "Български" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski" },
  { code: "sr", name: "Serbian", nativeName: "Srpski" },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "bs", name: "Bosnian", nativeName: "Bosanski" },
  { code: "cnr", name: "Montenegrin", nativeName: "Crnogorski" },
  { code: "mk", name: "Macedonian", nativeName: "Македонски" },
  { code: "sq", name: "Albanian", nativeName: "Shqip" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių" },
  { code: "lv", name: "Latvian", nativeName: "Latviešu" },
  { code: "et", name: "Estonian", nativeName: "Eesti" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "is", name: "Icelandic", nativeName: "Íslenska" },
  { code: "ga", name: "Irish", nativeName: "Gaeilge" },
  { code: "mt", name: "Maltese", nativeName: "Malti" },
  { code: "lb", name: "Luxembourgish", nativeName: "Lëtzebuergesch" },
  { code: "ca", name: "Catalan", nativeName: "Català" },
  { code: "eu", name: "Basque", nativeName: "Euskara" },
  { code: "gl", name: "Galician", nativeName: "Galego" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "ka", name: "Georgian", nativeName: "ქართული" },
  { code: "hy", name: "Armenian", nativeName: "Հայերեն" },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycanca" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "fa", name: "Persian / Farsi", nativeName: "فارسی", rtl: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "he", name: "Hebrew", nativeName: "עברית", rtl: true },
  { code: "ar", name: "Modern Standard Arabic (MSA)", nativeName: "العربية", rtl: true },
  {
    code: "ar-eg",
    name: "Egyptian Arabic",
    nativeName: "العربية المصرية",
    variantOf: "ar",
    rtl: true,
  },
  {
    code: "ar-lev",
    name: "Levantine Arabic",
    nativeName: "العربية الشامية",
    variantOf: "ar",
    rtl: true,
  },
  {
    code: "ar-gulf",
    name: "Gulf Arabic",
    nativeName: "العربية الخليجية",
    variantOf: "ar",
    rtl: true,
  },
  {
    code: "ar-maghrebi",
    name: "Maghrebi Arabic",
    nativeName: "العربية المغربية",
    variantOf: "ar",
    rtl: true,
  },
  {
    code: "ar-iq",
    name: "Iraqi Arabic",
    nativeName: "العربية العراقية",
    variantOf: "ar",
    rtl: true,
  },
];

export function getLanguageByCode(code: string): LanguageOption | undefined {
  return LANGUAGES.find((language) => language.code === code);
}

export const LANGUAGE_CODES: string[] = LANGUAGES.map((language) => language.code);
