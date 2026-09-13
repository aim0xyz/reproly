// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BugDrop",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(name: "BugDrop", targets: ["BugDrop"])
    ],
    targets: [
        .target(name: "BugDrop"),
        .testTarget(name: "BugDropTests", dependencies: ["BugDrop"])
    ]
)
