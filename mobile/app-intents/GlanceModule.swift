internal import ExpoModulesCore

/// Inline module the app writes today's summary through (`src/features/glance/writer.ts`).
final class GlanceModule: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("RentopyaGlance")

    Function("setSummary") { (json: String) -> Bool in
      return GlanceStore.save(json: json)
    }

    Function("clearSummary") {
      GlanceStore.clear()
    }
  }
}
