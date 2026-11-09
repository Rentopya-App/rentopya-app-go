# targets/

Native Apple targets (Home Screen / Lock Screen widgets, a watch app), added
with the `@bacons/apple-targets` config plugin: one folder per target with an
`expo-target.config.js`, its Swift sources, `Info.plist` and `tr.lproj` /
`en.lproj` strings. Empty until the first target lands.

Identifiers derive from the app's `com.rentopya.app`:

| Target                              | Bundle id                  |
| ----------------------------------- | -------------------------- |
| Widget extension                    | `com.rentopya.app.widgets` |
| Shared App Group (app + extensions) | `group.com.rentopya.app`   |

When the first target is added: `npx expo install @bacons/apple-targets`, add
`"@bacons/apple-targets"` to `plugins` in `app.json`, give the app and the
target the App Group entitlement, and list the extension under
`extra.eas.build.experimental.ios.appExtensions` so EAS provisions it.
`Assets.xcassets` is generated on prebuild (already in `.gitignore`).
