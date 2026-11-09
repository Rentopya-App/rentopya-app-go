# app-intents/

Swift for Siri, Shortcuts and Spotlight (App Intents), compiled into the app
target by `expo-app-intents` through Expo inline modules. Empty until the
first intent lands.

When it does: `npx expo install expo-app-intents`, add `"expo-app-intents"` to
`plugins` and `"inlineModules": { "watchedDirectories": ["app-intents"] }` to
`experiments` in `app.json`. Phrases go in `AppShortcuts.swift` (English
source, at most 10 shortcuts, every phrase with `\(.applicationName)`); the
Turkish phrases in `plugins/app-shortcuts/tr.json` through a config plugin
that writes `AppShortcuts.strings`. A changed phrase or intent needs a new
build; an OTA update cannot change it.
