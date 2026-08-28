import XCTest
@testable import Sidewise_iOS

final class StoryTests: XCTestCase {
    private func source(_ outlet: String, _ bias: Int) -> Source {
        Source(title: "\(outlet) headline", link: "https://example.com/\(outlet)", outlet: outlet, bias: bias)
    }

    private lazy var mixed = Story(
        title: "Assad sentenced in absentia",
        sources: [source("NPR", -1), source("BBC", 0), source("Fox News", 2)],
        blindspot: false
    )
    private lazy var rightOnly = Story(
        title: "Border bill stalls",
        sources: [source("Fox News", 2), source("Daily Wire", 2)],
        blindspot: true
    )

    func testSideMapping() {
        XCTAssertEqual(source("NPR", -2).side, .left)
        XCTAssertEqual(source("BBC", 0).side, .center)
        XCTAssertEqual(source("Fox News", 1).side, .right)
    }

    func testCounts() {
        XCTAssertEqual(mixed.count(.left), 1)
        XCTAssertEqual(mixed.count(.center), 1)
        XCTAssertEqual(mixed.count(.right), 1)
        XCTAssertNil(mixed.lonelySide)
        XCTAssertEqual(rightOnly.lonelySide, .right)
    }

    func testFilterBySide() {
        let all = [mixed, rightOnly]
        XCTAssertEqual(filterStories(all, filter: .left, query: "").count, 1)
        XCTAssertEqual(filterStories(all, filter: .right, query: "").count, 2)
        XCTAssertEqual(filterStories(all, filter: .blindspots, query: "").map(\.id), [rightOnly.id])
    }

    func testSearchMatchesTitleSourceAndOutlet() {
        let all = [mixed, rightOnly]
        XCTAssertEqual(filterStories(all, filter: .all, query: "assad").map(\.id), [mixed.id])
        XCTAssertEqual(filterStories(all, filter: .all, query: "daily wire").map(\.id), [rightOnly.id])
        XCTAssertEqual(filterStories(all, filter: .all, query: "  NPR ").map(\.id), [mixed.id])
        XCTAssertTrue(filterStories(all, filter: .all, query: "zzz").isEmpty)
    }

    func testDecodesAPIPayload() throws {
        let json = """
        {"updated":1786462923027,
         "stories":[{"title":"T","sources":[{"title":"T","link":"https://a","outlet":"BBC","bias":0}],"blindspot":false}],
         "latest":[{"title":"T","link":"https://a","outlet":"BBC","bias":0,"ts":1786462923027}]}
        """.data(using: .utf8)!
        let feed = try JSONDecoder().decode(Feed.self, from: json)
        XCTAssertEqual(feed.stories.count, 1)
        XCTAssertEqual(feed.latest.first?.outlet, "BBC")
    }
}
