import SwiftUI

struct StoryRow: View {
    let story: Story

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(story.title)
                .font(.headline)
                .fontWeight(.semibold)
                .multilineTextAlignment(.leading)
            BiasBar(story: story)
            HStack(spacing: 8) {
                Text("\(story.sources.count) outlet\(story.sources.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if story.blindspot, let side = story.lonelySide {
                    BlindspotTag(side: side)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct SourceRow: View {
    let source: Source

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(source.title)
                .font(.subheadline)
                .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
                Circle().fill(source.side.color).frame(width: 6, height: 6)
                Text(source.outlet)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
