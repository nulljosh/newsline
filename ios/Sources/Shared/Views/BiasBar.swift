import SwiftUI

extension Side {
    var color: Color {
        switch self {
        case .left: return Color(red: 0.16, green: 0.31, blue: 0.55)
        case .center: return Color.secondary
        case .right: return Color(red: 0.75, green: 0.23, blue: 0.17)
        }
    }
    var label: String { rawValue.capitalized }
}

/// Proportional left/center/right coverage for one story.
struct BiasBar: View {
    let story: Story

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(Side.allCases, id: \.self) { side in
                    side.color.frame(width: width(side, total: geo.size.width))
                }
            }
        }
        .frame(height: 5)
        .clipShape(Capsule())
        .accessibilityLabel(Side.allCases.map { "\($0.label) \(story.count($0))" }.joined(separator: ", "))
    }

    private func width(_ side: Side, total: CGFloat) -> CGFloat {
        let all = story.sources.count
        guard all > 0 else { return 0 }
        return total * CGFloat(story.count(side)) / CGFloat(all)
    }
}

struct BlindspotTag: View {
    let side: Side

    var body: some View {
        Text("\(side.label)-only")
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .overlay(Capsule().stroke(side.color, lineWidth: 1))
            .foregroundStyle(side.color)
    }
}
