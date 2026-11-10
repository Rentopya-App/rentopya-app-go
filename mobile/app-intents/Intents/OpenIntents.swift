import AppIntents
internal import ExpoAppIntents

/// Actions that open the app. Each one queues an invocation that the app's handler
/// (`src/features/intents/handler.tsx`, `routes.ts`) routes once the session is ready; the
/// dispatch names and parameter keys must match there.

struct OpenTodayIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Today"
  static let description = IntentDescription("Opens Rentopya on today's handovers and returns.")
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await AppIntentDispatcher.shared.dispatch(name: "openToday")
    return .result()
  }
}

/// "Araç bul": a plate opens the vehicle when exactly one matches, else the vehicle list searched by it.
struct FindVehicleIntent: AppIntent {
  static let title: LocalizedStringResource = "Find Vehicle"
  static let description = IntentDescription("Finds a vehicle in Rentopya by its plate.")
  static let openAppWhenRun = true

  @Parameter(title: "Plate", requestValueDialog: "Which plate should I look for?")
  var plate: String

  static var parameterSummary: some ParameterSummary {
    Summary("Find the vehicle \(\.$plate)")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    await AppIntentDispatcher.shared.dispatch(name: "findVehicle", params: ["plate": .string(plate)])
    return .result()
  }
}
