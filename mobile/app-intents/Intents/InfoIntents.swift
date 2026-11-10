import AppIntents
import SwiftUI

/// Answers Siri reads out without opening the app, from the summary the Today screen last wrote
/// (`GlanceSnapshot`): as fresh as the app's last look at the day; an older one says when it was
/// taken, and another day's numbers are never read out as today's.

private func say(_ text: String) -> IntentDialog {
  IntentDialog(stringLiteral: text)
}

private func signedOut() -> IntentDialog {
  "Open Rentopya and sign in first; then I can tell you about your day."
}

/// "Bugünkü teslimler": today's handover and return counts and the next job.
struct TodayHandoversIntent: AppIntent {
  static let title: LocalizedStringResource = "Today's Handovers"
  static let description = IntentDescription("Today's handovers and returns and the next job, from Rentopya.")

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    guard let snapshot = GlanceStore.load() else {
      return .result(dialog: signedOut(), view: JobsSnippet(snapshot: nil))
    }
    let text = snapshot.isOK ? "\(snapshot.texts.summary) \(snapshot.nextSentence)" : ""
    let fresh = snapshot.isOK && !snapshot.isStale
    return .result(
      dialog: say(snapshot.answer(text)),
      view: JobsSnippet(snapshot: fresh ? snapshot : nil, limit: 3)
    )
  }
}

/// "Sıradaki iş": the first open handover or return of the day.
struct NextJobIntent: AppIntent {
  static let title: LocalizedStringResource = "Next Job"
  static let description = IntentDescription("Your next handover or return today: time, plate and customer initials.")

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    guard let snapshot = GlanceStore.load() else {
      return .result(dialog: signedOut(), view: JobsSnippet(snapshot: nil))
    }
    let fresh = snapshot.isOK && !snapshot.isStale
    return .result(
      dialog: say(snapshot.answer(snapshot.nextSentence)),
      view: JobsSnippet(snapshot: fresh ? snapshot : nil, limit: 1)
    )
  }
}
