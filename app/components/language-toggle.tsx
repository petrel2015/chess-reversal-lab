"use client";

import { useI18n, type Locale } from "../lib/i18n";

const options: Locale[] = ["zh", "en"];

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label={t("lang.toggleAria")}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={locale === option ? "active" : ""}
          aria-pressed={locale === option}
          onClick={() => setLocale(option)}
        >
          {option === "zh" ? "中" : "EN"}
        </button>
      ))}
    </div>
  );
}
