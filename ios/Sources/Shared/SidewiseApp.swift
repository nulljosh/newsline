import SwiftUI

@main
struct SidewiseApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        #if os(macOS)
        .defaultSize(width: 900, height: 640)
        #endif
    }
}
