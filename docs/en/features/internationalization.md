# Internationalization

## Summary

Internationalization gives the app a bilingual interface (Simplified Chinese and English) with automatic browser-language detection, persisted manual choice, and a hydration-safe server render.

## Background

Chess notation is universal, but instructions, validation messages, and evaluation wording are not. The project's earliest audience was Chinese-speaking; making English a first-class path widens reach without forking the app.

## Problem

After translation came infrastructure issues: server-rendered HTML must not flash or mismatch when the client prefers the other language; switching mid-game must not leave stale status text behind.

## Goals

- First visit matches browser language (`zh*` → Chinese, otherwise English).
- Manual toggle wins immediately and persists across visits.
- Zero hydration mismatch on first paint.
- Every user-visible string — including dynamic ones like "reviewing move 3/12 · Nf3" — translates.

## Non-Goals

This feature does not aim to:

- add further locales in v0.1.0
- localize chess piece letters in algebraic notation (kept standard)
- provide RTL layout or non-Gregorian formatting (not applicable)

## Solution Overview

- Two flat dictionaries (`zh`, `en`) of identical keys live side by side in `app/lib/i18n.tsx`; `translate(locale, key, params)` does `{name}`-style interpolation and falls back zh→key.
- A React context exposes `{locale, setLocale, t}`; components call `t()` instead of hardcoding strings.
- Detection order: `localStorage["locale"]` → `navigator.language` → default `zh`.
- Hydration safety: SSR always renders Chinese; a mount-time effect switches locale after hydration, so markup matches byte-for-byte on first render.
- Locale change effects: update `<html lang>`, `document.title`, and re-derive the current status message through a pure `statusMessage(locale)` helper so no string lingers from the previous language.
- Pure-rule modules (`chess-utils.ts`) stay i18n-free by returning keys; presentation resolves them.

## Detailed Behavior

Unknown keys fall back to the Chinese dictionary, then to the key itself. Storage failures (private mode) are swallowed for both read and write. The toggle shows 中 / EN with an active state and reflects changes instantly everywhere via context.

## User Experience

Switching languages keeps the entire game state intact — only strings change.

![English interface](../../img/overview-en.webp)

## Compatibility and Historical Impact

The initial release predates i18n during its development window; it was added before the v0.1.0 umbrella closed, so no released behavior was ever broken. Users who had used earlier deployments would simply gain an English option; the stored `locale` key did not exist before and conflicts with nothing.

## Data and Privacy Impact

Introduces the project's *only* persistent storage: one `localStorage` key holding `"zh"` or `"en"`. No other data is read or written.

## Performance Impact

Dictionary lookup is O(1); dictionaries ship inside the main bundle (~a few KB each). No lazy-loading complexity warranted at this size.

## Current Limitations

- Dictionaries must be kept manually in sync; missing keys degrade silently to Chinese.
- Language switch triggers a full re-render of translated trees (acceptable at this scale).
- No plurals/gender machinery — message templates use explicit placeholders.

## Release Information

Introduced: v0.1.0 · Status: Stable

## Related Documentation

[Usage guide](../usage.md#switch-language) · [Privacy](../privacy.md)

## Feature Changelog

### v0.1.0

Initial release: zh/en dictionaries, detection, persistence, hydration-safe SSR default.
