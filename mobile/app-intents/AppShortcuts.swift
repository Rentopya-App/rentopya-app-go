import AppIntents

/// Siri phrases and the Shortcuts app's ready-made actions (at most 10 App Shortcuts). The phrases
/// are the English source; the Turkish ones live in `plugins/app-shortcuts/tr.json` under the same
/// keys. Every phrase needs `\(.applicationName)`, and a changed phrase needs a new store build.
struct AppShortcuts: AppShortcutsProvider {
  static var shortcutTileColor: ShortcutTileColor { .navy }

  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TodayHandoversIntent(),
      phrases: [
        "Today's handovers in \(.applicationName)",
        "\(.applicationName) handovers today",
        "How many handovers today in \(.applicationName)",
        "\(.applicationName) today",
      ],
      shortTitle: "Today's Handovers",
      systemImageName: "car.fill"
    )
    AppShortcut(
      intent: NextJobIntent(),
      phrases: [
        "What's my next job in \(.applicationName)",
        "Next job in \(.applicationName)",
        "Next handover in \(.applicationName)",
      ],
      shortTitle: "Next Job",
      systemImageName: "clock.badge"
    )
    AppShortcut(
      intent: OpenTodayIntent(),
      phrases: [
        "Open today in \(.applicationName)",
        "Show today's handovers in \(.applicationName)",
      ],
      shortTitle: "Open Today",
      systemImageName: "house.fill"
    )
    AppShortcut(
      intent: FindVehicleIntent(),
      phrases: [
        "Find a vehicle in \(.applicationName)",
        "Find a car in \(.applicationName)",
        "Search a plate in \(.applicationName)",
      ],
      shortTitle: "Find Vehicle",
      systemImageName: "magnifyingglass"
    )
  }
}
