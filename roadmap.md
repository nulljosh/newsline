# Newsline Roadmap

## 2026-07-15 (later)
- [ ] iOS companion app — deferred (weekly usage was at ~85-87%). When picked up: fetch `/api/stories`, list + detail or grouped-by-bias view. Reuse the xcodegen pattern from `journal/ios/` (smallest existing example): `project.yml` + `Sources/Shared/{Models,Services,Views}` + `Sources/iOS/`, plain `URLSession.shared.data(from:)` in an `ObservableObject` service, no auth needed since the API is public/unauthenticated.
