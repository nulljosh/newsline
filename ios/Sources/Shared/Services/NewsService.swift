import Foundation

@MainActor
final class NewsService: ObservableObject {
    @Published var feed: Feed?
    @Published var isLoading = false
    @Published var error: String?
    /// Story titles the user saved. Persisted so saves survive a relaunch.
    @Published private(set) var saved: [Story] = []

    private let endpoint = URL(string: "https://news.heyitsmejosh.com/api/stories")!
    private let cacheURL: URL
    private let savedURL: URL

    init() {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        cacheURL = dir.appendingPathComponent("sidewise-feed.json")
        savedURL = dir.appendingPathComponent("sidewise-saved.json")
        feed = try? JSONDecoder().decode(Feed.self, from: Data(contentsOf: cacheURL))
        saved = (try? JSONDecoder().decode([Story].self, from: Data(contentsOf: savedURL))) ?? []
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: endpoint)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            feed = try JSONDecoder().decode(Feed.self, from: data)
            error = nil
            try? data.write(to: cacheURL, options: .atomic)
        } catch {
            // Keep whatever the cache gave us; only the banner changes.
            self.error = (error as? URLError)?.localizedDescription ?? error.localizedDescription
        }
    }

    // MARK: - Saved

    func isSaved(_ story: Story) -> Bool { saved.contains { $0.id == story.id } }

    func toggleSave(_ story: Story) {
        if let i = saved.firstIndex(where: { $0.id == story.id }) {
            saved.remove(at: i)
        } else {
            saved.insert(story, at: 0)
        }
        try? JSONEncoder().encode(saved).write(to: savedURL, options: .atomic)
    }
}

/// Filtering lives outside the service so it stays pure and testable.
enum StoryFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case blindspots = "Blindspots"
    case left = "Left"
    case center = "Center"
    case right = "Right"

    var id: String { rawValue }

    func matches(_ story: Story) -> Bool {
        switch self {
        case .all: return true
        case .blindspots: return story.blindspot
        case .left: return story.count(.left) > 0
        case .center: return story.count(.center) > 0
        case .right: return story.count(.right) > 0
        }
    }
}

func filterStories(_ stories: [Story], filter: StoryFilter, query: String) -> [Story] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    return stories.filter { story in
        guard filter.matches(story) else { return false }
        guard !q.isEmpty else { return true }
        return story.title.lowercased().contains(q)
            || story.sources.contains { $0.title.lowercased().contains(q) || $0.outlet.lowercased().contains(q) }
    }
}
