import SwiftUI

/// The card Siri and Shortcuts show under an answer: today's counts and the next open jobs.
struct JobsSnippet: View {
  let snapshot: GlanceSnapshot?
  var limit: Int = 3

  private static let brand = Color(red: 46.0 / 255, green: 53.0 / 255, blue: 140.0 / 255)

  var body: some View {
    if let snapshot {
      VStack(alignment: .leading, spacing: 10) {
        Label(snapshot.heading, systemImage: "car.fill")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        HStack(spacing: 18) {
          count(symbol: "arrow.up.right", label: snapshot.labels.handover, value: snapshot.handovers)
          count(symbol: "arrow.down.to.line", label: snapshot.labels.returnLabel, value: snapshot.returns)
        }
        ForEach(snapshot.jobs.prefix(limit), id: \.id) { job in
          HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(job.time)
              .font(.subheadline.weight(.semibold).monospacedDigit())
              .foregroundStyle(snapshot.isLate(job) ? Color.red : Self.brand)
            Text(snapshot.typeLabel(job))
              .font(.caption.weight(.medium))
              .foregroundStyle(.secondary)
            Text(job.initials.isEmpty ? job.plate : "\(job.plate) · \(job.initials)")
              .font(.subheadline.weight(.medium))
              .lineLimit(1)
            Spacer(minLength: 0)
            if snapshot.isLate(job) {
              Text(snapshot.labels.late)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.red)
            }
          }
        }
      }
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      EmptyView()
    }
  }

  private func count(symbol: String, label: String, value: GlanceSnapshot.Counts) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Label(label, systemImage: symbol)
        .font(.caption)
        .foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text("\(value.total)")
          .font(.title2.weight(.bold).monospacedDigit())
        Text("\(value.done)/\(value.total)")
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }
    }
  }
}
