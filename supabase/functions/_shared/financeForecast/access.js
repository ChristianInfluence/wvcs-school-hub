// This module intentionally has a narrower audience than Office & Finance.
const forecastEmails = new Set(["mconniry@wvcs.org", "hmiller@wvcs.org"]);

export function canUseForecast(email = "") {
  return forecastEmails.has(String(email).trim().toLowerCase());
}

export function isVerifiedForecastUser(user) {
  return Boolean(user?.id && user?.email_confirmed_at && canUseForecast(user.email));
}
