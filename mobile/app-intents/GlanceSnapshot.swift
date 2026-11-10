import Foundation

/// Today's handovers, returns and open jobs as the app last saw them on the Today screen
/// (`src/features/glance/summary.ts`, `TodaySummary`). Kept in the App Group
/// `group.com.rentopya.app`, so Siri answers without the network or a token. Every sentence
/// arrives translated by the app's i18n; Swift only picks one. Bump `v` with the TypeScript type.
struct GlanceSnapshot: Codable, Sendable {
  struct Counts: Codable, Sendable {
    var total: Int
    var done: Int
  }

  struct Job: Codable, Sendable {
    /// Rental uuid.
    var id: String
    /// "handover" or "return".
    var type: String
    /// Due time, epoch milliseconds.
    var at: Double
    /// "14:30" in the organization zone.
    var time: String
    var plate: String
    /// Customer initials only ("AY").
    var initials: String
    /// "14:30 teslim, 34 ABC 123 (AY)."
    var say: String
  }

  struct Labels: Codable, Sendable {
    var handover: String
    var returnLabel: String
    var late: String

    enum CodingKeys: String, CodingKey {
      case handover
      case returnLabel = "return"
      case late
    }
  }

  struct Texts: Codable, Sendable {
    var summary: String
    var nextIntro: String
    var noNext: String
    var stale: String
    var signedOut: String
    var noAccess: String
    var updated: String
  }

  var v: Int
  /// "ok", "signedOut" or "noAccess".
  var state: String
  var org: String
  var branch: String
  /// `YYYY-MM-DD` of the organization's day.
  var date: String
  /// "Pazartesi 9 Kasım".
  var day: String
  /// End of that day (exclusive), epoch milliseconds.
  var dayEnd: Double
  var updatedAt: Double
  var handovers: Counts
  var returns: Counts
  var jobs: [Job]
  var labels: Labels
  var texts: Texts
}

enum GlanceStore {
  static let suite = "group.com.rentopya.app"
  static let key = "rentopya.glance.today"
  static let version = 1

  private static var defaults: UserDefaults? { UserDefaults(suiteName: suite) }

  static func load() -> GlanceSnapshot? {
    guard let data = defaults?.data(forKey: key),
      let snapshot = try? JSONDecoder().decode(GlanceSnapshot.self, from: data),
      snapshot.v == version
    else {
      return nil
    }
    return snapshot
  }

  /// Stores the JSON only when it decodes, so a broken write never replaces a good summary.
  static func save(json: String) -> Bool {
    guard let data = json.data(using: .utf8),
      (try? JSONDecoder().decode(GlanceSnapshot.self, from: data)) != nil,
      let defaults
    else {
      return false
    }
    defaults.set(data, forKey: key)
    return true
  }

  static func clear() {
    defaults?.removeObject(forKey: key)
  }
}

extension GlanceSnapshot {
  var isOK: Bool { state == "ok" }

  /// The organization's day is over: the numbers are not today's any more.
  var isStale: Bool { Date().timeIntervalSince1970 * 1000 >= dayEnd }

  private var isOld: Bool { Date().timeIntervalSince1970 * 1000 - updatedAt > 30 * 60 * 1000 }

  var heading: String {
    let place = branch.isEmpty ? org : "\(org) · \(branch)"
    return day.isEmpty ? place : "\(place) · \(day)"
  }

  /// An answer built from the summary; "open the app" when it is another day's, "last updated"
  /// appended when it is older than half an hour.
  func answer(_ text: String) -> String {
    if state == "signedOut" { return texts.signedOut }
    if state == "noAccess" { return texts.noAccess }
    if isStale { return texts.stale }
    return isOld && !texts.updated.isEmpty ? "\(text) \(texts.updated)" : text
  }

  /// "Next job: 14:30 handover, 34 ABC 123 (AY)." or "No open jobs left today."
  var nextSentence: String {
    guard let job = jobs.first else { return texts.noNext }
    return "\(texts.nextIntro) \(job.say)"
  }

  func typeLabel(_ job: Job) -> String { job.type == "return" ? labels.returnLabel : labels.handover }

  func isLate(_ job: Job, now: Date = Date()) -> Bool { job.at < now.timeIntervalSince1970 * 1000 }
}
