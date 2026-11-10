# plugins/

Project config plugins (`with-*.js`), referenced from `plugins` in `app.json`
as `"./plugins/with-…"`. Use them for native settings `app.json` cannot
express; never edit `ios/` or `android/` (CNG).

- `with-xcode-cloud.js`: copies `scripts/xcode-cloud/*.sh` into `ios/ci_scripts/`
  on every prebuild (Xcode Cloud custom build scripts, `docs/OTA.md`).
- `with-app-shortcuts-strings.js`: writes `<lang>.lproj/AppShortcuts.strings`
  (Siri phrases) from `app-shortcuts/<lang>.json`; keys are the English phrases
  in `app-intents/AppShortcuts.swift`.
