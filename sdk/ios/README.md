# BugDrop iOS SDK

This package is an early, local-first SDK prototype. It keeps a bounded rolling timeline on the device and only produces a report after the user reviews and submits the form. It does not upload reports by itself.

## Add it to an app

Add `sdk/ios` as a local Swift package in Xcode, then start capture during app launch:

```swift
import BugDrop

BugDrop.shared.start()
BugDrop.shared.addBreadcrumb("Opened checkout", category: "navigation")
```

For automatic failed-request evidence, use the provided session for the requests you want BugDrop to observe:

```swift
let session = BugDrop.shared.makeURLSession()
let (data, response) = try await session.data(for: request)
```

Only failed transports and HTTP responses with status 400 or higher become events. The SDK retains the method, status code, and URL after removing credentials, queries, and fragments. It does not retain headers, cookies, request bodies, response bodies, or successful requests.

Present the review UI from a support or feedback screen:

```swift
NavigationStack {
    BugDropReportView(includePreviousSession: true) { reviewedReport in
        // Upload through your authenticated BugDrop Cloud client, or export locally.
        // No network delivery is built into the open-source SDK.
    }
}
```

Set `includePreviousSession` only when that context is useful. A retained previous session can result from a normal app termination and must not be presented as proof of a crash.

## Crash boundary

The rolling timeline is persisted after each event, so evidence from before an unexpected termination can survive the next launch. This initial SDK does not install signal or exception handlers and does not claim to capture an iOS crash stack trace. Reliable crash diagnostics should be added using MetricKit and symbolication, or a carefully audited crash-reporting component. The user should still review the combined report before sending it.

## Local verification

```sh
cd sdk/ios
swift test
```
