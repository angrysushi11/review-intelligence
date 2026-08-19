import { APP_STORE_COUNTRIES } from "../web/storefronts.js";
import { COUNTRY_LANGUAGE_OPTIONS, COUNTRY_OPTIONS, marketByKey, marketsForRequest } from "../web/markets.js";

const LOCALE_ALIASES = {
  "en-US": { country: "us", label: "English / United States" },
  "en-GB": { country: "gb", label: "English / United Kingdom" },
  "fr-FR": { country: "fr", label: "French / France" },
  "de-DE": { country: "de", label: "German / Germany" },
  "es-ES": { country: "es", label: "Spanish / Spain" },
  "pt-BR": { country: "br", label: "Portuguese / Brazil" },
  "ja-JP": { country: "jp", label: "Japanese / Japan" },
  "ko-KR": { country: "kr", label: "Korean / Korea" }
};

export { APP_STORE_COUNTRIES };
export { COUNTRY_LANGUAGE_OPTIONS };
export { COUNTRY_OPTIONS };

export const STOREFRONTS = {
  ...LOCALE_ALIASES,
  ...Object.fromEntries(
    APP_STORE_COUNTRIES.map(({ code, name }) => [code, { country: code, label: name }])
  )
};

export function normalizeCountry(value = "us") {
  const raw = String(value).trim();
  return STOREFRONTS[raw]?.country || raw.toLowerCase();
}

export function normalizeMarket(value = "en-US") {
  return marketByKey(value);
}

export function normalizeMarkets(value = "us") {
  return marketsForRequest(value);
}
