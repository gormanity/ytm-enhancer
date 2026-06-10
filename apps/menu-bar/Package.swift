// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "YTMMenuBarConnector",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(
      name: "YTMMenuBarConnector",
      targets: ["YTMMenuBarConnector"]
    )
  ],
  targets: [
    .executableTarget(
      name: "YTMMenuBarConnector",
      linkerSettings: [
        .linkedFramework("AppKit")
      ]
    )
  ]
)
