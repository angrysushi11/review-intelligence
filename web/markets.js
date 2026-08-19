import { APP_STORE_COUNTRIES } from "./storefronts.js";

const LANGUAGE_NAMES = {
  af: "Afrikaans",
  ar: "Arabic",
  az: "Azerbaijani",
  bn: "Bengali",
  bg: "Bulgarian",
  bs: "Bosnian",
  ca: "Catalan",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  et: "Estonian",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  ha: "Hausa",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  hy: "Armenian",
  id: "Indonesian",
  is: "Icelandic",
  it: "Italian",
  ja: "Japanese",
  ka: "Georgian",
  kk: "Kazakh",
  km: "Khmer",
  ko: "Korean",
  ky: "Kyrgyz",
  lo: "Lao",
  lt: "Lithuanian",
  lv: "Latvian",
  mg: "Malagasy",
  mk: "Macedonian",
  mn: "Mongolian",
  ms: "Malay",
  mt: "Maltese",
  my: "Burmese",
  ne: "Nepali",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  ps: "Pashto",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  rw: "Kinyarwanda",
  si: "Sinhala",
  sk: "Slovak",
  sl: "Slovenian",
  sq: "Albanian",
  sr: "Serbian",
  sv: "Swedish",
  sw: "Swahili",
  ta: "Tamil",
  te: "Telugu",
  tg: "Tajik",
  th: "Thai",
  tk: "Turkmen",
  tl: "Tagalog",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  uz: "Uzbek",
  vi: "Vietnamese",
  xh: "Xhosa",
  yo: "Yoruba",
  zu: "Zulu",
  zh: "Chinese"
};

const DEFAULT_LANGUAGE_BY_COUNTRY = {
  af: "en",
  al: "sq",
  dz: "ar",
  ao: "pt",
  ai: "en",
  ag: "en",
  ar: "es",
  am: "hy",
  au: "en",
  at: "de",
  az: "az",
  bs: "en",
  bh: "ar",
  bb: "en",
  by: "ru",
  be: "nl",
  bz: "en",
  bj: "fr",
  bm: "en",
  bt: "en",
  bo: "es",
  ba: "bs",
  bw: "en",
  br: "pt",
  vg: "en",
  bn: "ms",
  bg: "bg",
  bf: "fr",
  kh: "km",
  cm: "fr",
  ca: "en",
  cv: "pt",
  ky: "en",
  td: "fr",
  cl: "es",
  cn: "zh",
  co: "es",
  cd: "fr",
  cg: "fr",
  cr: "es",
  ci: "fr",
  hr: "hr",
  cy: "el",
  cz: "cs",
  dk: "da",
  dm: "en",
  do: "es",
  ec: "es",
  eg: "ar",
  sv: "es",
  ee: "et",
  sz: "en",
  fj: "en",
  fi: "fi",
  fr: "fr",
  ga: "fr",
  ge: "ka",
  de: "de",
  gh: "en",
  gr: "el",
  gd: "en",
  gt: "es",
  gw: "pt",
  gy: "en",
  hn: "es",
  hk: "zh",
  hu: "hu",
  is: "is",
  in: "en",
  id: "id",
  iq: "ar",
  ie: "en",
  il: "he",
  it: "it",
  jm: "en",
  jp: "ja",
  jo: "ar",
  kz: "ru",
  ke: "en",
  xk: "sq",
  kw: "ar",
  kg: "ru",
  la: "lo",
  lv: "lv",
  lb: "ar",
  lr: "en",
  ly: "ar",
  lt: "lt",
  lu: "fr",
  mo: "zh",
  mg: "fr",
  mw: "en",
  my: "ms",
  mv: "en",
  ml: "fr",
  mt: "en",
  mr: "ar",
  mu: "en",
  mx: "es",
  fm: "en",
  md: "ro",
  mn: "mn",
  me: "sr",
  ms: "en",
  ma: "ar",
  mz: "pt",
  mm: "my",
  na: "en",
  nr: "en",
  np: "ne",
  nl: "nl",
  nz: "en",
  ni: "es",
  ne: "fr",
  ng: "en",
  mk: "mk",
  no: "no",
  om: "ar",
  pk: "en",
  pw: "en",
  pa: "es",
  pg: "en",
  py: "es",
  pe: "es",
  ph: "en",
  pl: "pl",
  pt: "pt",
  qa: "ar",
  ro: "ro",
  ru: "ru",
  rw: "fr",
  st: "pt",
  sa: "ar",
  sn: "fr",
  rs: "sr",
  sc: "en",
  sl: "en",
  sg: "en",
  sk: "sk",
  si: "sl",
  sb: "en",
  za: "en",
  kr: "ko",
  es: "es",
  lk: "en",
  kn: "en",
  lc: "en",
  vc: "en",
  sr: "nl",
  se: "sv",
  ch: "de",
  tw: "zh",
  tj: "ru",
  tz: "en",
  th: "th",
  gm: "en",
  to: "en",
  tt: "en",
  tn: "ar",
  tm: "ru",
  tc: "en",
  tr: "tr",
  ug: "en",
  ua: "uk",
  ae: "ar",
  gb: "en",
  us: "en",
  uy: "es",
  uz: "ru",
  vu: "en",
  ve: "es",
  vn: "vi",
  ye: "ar",
  zm: "en",
  zw: "en"
};

const EXTRA_COUNTRY_LANGUAGE_OPTIONS = [
  { country: "af", language: "fa" },
  { country: "af", language: "ps" },
  { country: "dz", language: "fr" },
  { country: "am", language: "ru" },
  { country: "az", language: "ru" },
  { country: "bh", language: "en" },
  { country: "be", language: "fr" },
  { country: "be", language: "de" },
  { country: "bz", language: "es" },
  { country: "ba", language: "hr" },
  { country: "ba", language: "sr" },
  { country: "bn", language: "en" },
  { country: "kh", language: "en" },
  { country: "cm", language: "en" },
  { country: "ca", language: "fr" },
  { country: "td", language: "ar" },
  { country: "cy", language: "tr" },
  { country: "cy", language: "en" },
  { country: "eg", language: "en" },
  { country: "ee", language: "ru" },
  { country: "fj", language: "hi" },
  { country: "fi", language: "sv" },
  { country: "ge", language: "ru" },
  { country: "gw", language: "fr" },
  { country: "hk", language: "en" },
  { country: "in", language: "hi" },
  { country: "in", language: "ta" },
  { country: "in", language: "te" },
  { country: "in", language: "bn" },
  { country: "id", language: "en" },
  { country: "iq", language: "en" },
  { country: "il", language: "ar" },
  { country: "il", language: "en" },
  { country: "jo", language: "en" },
  { country: "kz", language: "kk" },
  { country: "ke", language: "sw" },
  { country: "xk", language: "sr" },
  { country: "kw", language: "en" },
  { country: "kg", language: "ky" },
  { country: "la", language: "en" },
  { country: "lv", language: "ru" },
  { country: "lb", language: "fr" },
  { country: "lb", language: "en" },
  { country: "lu", language: "de" },
  { country: "lu", language: "en" },
  { country: "ma", language: "fr" },
  { country: "mg", language: "mg" },
  { country: "mo", language: "pt" },
  { country: "mo", language: "en" },
  { country: "mt", language: "mt" },
  { country: "mr", language: "fr" },
  { country: "mu", language: "fr" },
  { country: "md", language: "ru" },
  { country: "me", language: "hr" },
  { country: "na", language: "af" },
  { country: "np", language: "en" },
  { country: "np", language: "hi" },
  { country: "mk", language: "sq" },
  { country: "om", language: "en" },
  { country: "pk", language: "ur" },
  { country: "ph", language: "tl" },
  { country: "qa", language: "en" },
  { country: "rw", language: "en" },
  { country: "rw", language: "rw" },
  { country: "sa", language: "en" },
  { country: "sc", language: "fr" },
  { country: "sg", language: "zh" },
  { country: "sg", language: "ms" },
  { country: "sg", language: "ta" },
  { country: "za", language: "af" },
  { country: "za", language: "zu" },
  { country: "za", language: "xh" },
  { country: "lk", language: "si" },
  { country: "lk", language: "ta" },
  { country: "sr", language: "en" },
  { country: "ch", language: "fr" },
  { country: "ch", language: "it" },
  { country: "tj", language: "tg" },
  { country: "tz", language: "sw" },
  { country: "tn", language: "fr" },
  { country: "ug", language: "sw" },
  { country: "ua", language: "ru" },
  { country: "ae", language: "en" },
  { country: "uz", language: "uz" }
];

const countryNameByCode = Object.fromEntries(APP_STORE_COUNTRIES.map(({ code, name }) => [code, name]));

export const COUNTRY_LANGUAGE_OPTIONS = buildCountryLanguageOptions();
export const COUNTRY_OPTIONS = buildCountryOptions();

export function marketByKey(value = "en-US") {
  const raw = String(value || "").trim();
  const rawLower = raw.toLowerCase();
  const countryOption = COUNTRY_OPTIONS.find((option) => option.key === rawLower || option.country === rawLower);

  return COUNTRY_LANGUAGE_OPTIONS.find((option) => option.key.toLowerCase() === rawLower)
    || COUNTRY_LANGUAGE_OPTIONS.find((option) => countryOption && option.key === countryOption.marketKey)
    || COUNTRY_LANGUAGE_OPTIONS.find((option) => option.country === rawLower)
    || COUNTRY_LANGUAGE_OPTIONS[0];
}

export function marketsForCountry(value = "us") {
  const selectedMarket = marketByKey(value);
  const countryOption = COUNTRY_OPTIONS.find((option) => option.country === selectedMarket.country);
  const defaultKey = countryOption?.marketKey || selectedMarket.key;
  return COUNTRY_LANGUAGE_OPTIONS
    .filter((option) => option.country === selectedMarket.country)
    .sort((a, b) => {
      if (a.key === defaultKey) return -1;
      if (b.key === defaultKey) return 1;
      return a.languageLabel.localeCompare(b.languageLabel);
    });
}

export function marketsForRequest(value = "us") {
  const raw = String(value || "").trim().toLowerCase();
  const exactMarket = COUNTRY_LANGUAGE_OPTIONS.find((option) => option.key.toLowerCase() === raw);
  return exactMarket ? [exactMarket] : marketsForCountry(raw);
}

function buildCountryOptions() {
  return APP_STORE_COUNTRIES.map(({ code, name }) => {
    const language = DEFAULT_LANGUAGE_BY_COUNTRY[code] || "en";
    const languages = languagesForCountry(code);
    return {
      key: code,
      value: code,
      country: code,
      language,
      marketKey: marketKey(language, code),
      marketKeys: languages.map((item) => marketKey(item.language, code)),
      languages: languages.map((item) => item.language),
      label: name,
      countryLabel: name,
      languageLabel: languageName(language),
      languageLabels: languages.map((item) => languageName(item.language))
    };
  }).sort((a, b) => {
    if (a.country === "us") return -1;
    if (b.country === "us") return 1;
    return a.label.localeCompare(b.label);
  });
}

function languagesForCountry(country) {
  const primaryLanguage = DEFAULT_LANGUAGE_BY_COUNTRY[country] || "en";
  const languages = [
    { language: primaryLanguage },
    ...EXTRA_COUNTRY_LANGUAGE_OPTIONS.filter((option) => option.country === country)
  ];
  const unique = new Map();
  for (const option of languages) {
    if (unique.has(option.language)) continue;
    unique.set(option.language, option);
  }
  return [...unique.values()];
}

function buildCountryLanguageOptions() {
  const options = [
    ...APP_STORE_COUNTRIES.map(({ code }) => ({
      country: code,
      language: DEFAULT_LANGUAGE_BY_COUNTRY[code] || "en"
    })),
    ...EXTRA_COUNTRY_LANGUAGE_OPTIONS
  ];

  const unique = new Map();
  for (const option of options) {
    const key = marketKey(option.language, option.country);
    if (unique.has(key)) continue;
    unique.set(key, {
      key,
      country: option.country,
      language: option.language,
      label: `${countryNameByCode[option.country] || option.country.toUpperCase()} / ${languageName(option.language)}`,
      countryLabel: countryNameByCode[option.country] || option.country.toUpperCase(),
      languageLabel: languageName(option.language)
    });
  }

  return [...unique.values()].sort((a, b) => {
    if (a.country === "us" && a.language === "en") return -1;
    if (b.country === "us" && b.language === "en") return 1;
    return a.label.localeCompare(b.label);
  });
}

function marketKey(language, country) {
  return `${language}-${country.toUpperCase()}`;
}

function languageName(language) {
  return LANGUAGE_NAMES[language] || language.toUpperCase();
}
