import Foundation

/// One outlet's headline for a story. `bias` is -2 (left) … +2 (right); 0 is center.
struct Source: Codable, Hashable, Identifiable {
    let title: String
    let link: String
    let outlet: String
    let bias: Int

    var id: String { link }
    var side: Side { bias < 0 ? .left : bias > 0 ? .right : .center }
    var url: URL? { URL(string: link) }
}

enum Side: String, Codable, CaseIterable {
    case left, center, right
}

/// A cluster of headlines from different outlets about the same event.
struct Story: Codable, Hashable, Identifiable {
    let title: String
    let sources: [Source]
    let blindspot: Bool

    var id: String { title }

    func count(_ side: Side) -> Int { sources.filter { $0.side == side }.count }

    /// The one political side covering this, if only one does.
    var lonelySide: Side? {
        let sides = Set(sources.map(\.side))
        return sides.count == 1 ? sides.first : nil
    }

    var outlets: String {
        sources.map(\.outlet).joined(separator: ", ")
    }
}

struct Feed: Codable {
    let updated: Double
    let stories: [Story]
    let latest: [Source]

    var updatedAt: Date { Date(timeIntervalSince1970: updated / 1000) }
}
