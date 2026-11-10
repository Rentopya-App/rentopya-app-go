# app-intents/

Swift for Siri and Shortcuts (App Intents), compiled into the app target by
`expo-app-intents` through Expo inline modules
(`experiments.inlineModules.watchedDirectories` in `app.json`).

| File                        | What                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AppShortcuts.swift`        | Siri phrases (English source, at most 10 shortcuts, every phrase with `\(.applicationName)`)           |
| `Intents/InfoIntents.swift` | "Bugünkü teslimler" and "Sıradaki iş": spoken answer + card from the App Group summary, app stays shut |
| `Intents/OpenIntents.swift` | "Bugünü aç" and "Araç bul" (plate): queue an invocation the app routes (`src/features/intents`)        |
| `GlanceSnapshot.swift`      | Decodes the summary the app writes (`src/features/glance/summary.ts`, same shape, same `v`)            |
| `GlanceModule.swift`        | Inline module `RentopyaGlance`: the app writes / clears the summary in `group.com.rentopya.app`        |
| `Views/JobsSnippet.swift`   | The card under Siri's answer                                                                           |
| `AppIntentsSetup.swift`     | Required by `expo-app-intents` (keep the class name)                                                   |

Turkish phrases: `plugins/app-shortcuts/tr.json` (same keys as the English
phrases), written to `tr.lproj/AppShortcuts.strings` by
`plugins/with-app-shortcuts-strings.js`. A changed phrase, intent or Swift file
changes the native fingerprint: it ships in a store build, never OTA.
