import SwiftUI

struct StoryDetailView: View {
    let story: Story
    @EnvironmentObject var service: NewsService
    @Environment(\.openURL) private var openURL

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(story.title).font(.title3.weight(.semibold))
                    BiasBar(story: story)
                    HStack(spacing: 14) {
                        ForEach(Side.allCases, id: \.self) { side in
                            Label("\(story.count(side))", systemImage: "circle.fill")
                                .labelStyle(.titleAndIcon)
                                .font(.caption)
                                .imageScale(.small)
                                .foregroundStyle(side.color)
                                .accessibilityLabel("\(side.label): \(story.count(side))")
                        }
                    }
                    if story.blindspot, let side = story.lonelySide {
                        Text("Blindspot — only \(side.label.lowercased())-leaning outlets are covering this.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Coverage") {
                ForEach(story.sources) { source in
                    Button {
                        if let url = source.url { openURL(url) }
                    } label: {
                        SourceRow(source: source)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationTitle("Story")
        .toolbar {
            Button {
                service.toggleSave(story)
            } label: {
                Label(service.isSaved(story) ? "Saved" : "Save",
                      systemImage: service.isSaved(story) ? "bookmark.fill" : "bookmark")
            }
        }
    }
}
