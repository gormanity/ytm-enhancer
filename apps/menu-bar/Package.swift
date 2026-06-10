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
      resources: [
        .copy("Resources/extension-icon.svg"),
        .copy("Resources/extension-icon-monochrome.svg"),
      ],
      linkerSettings: [
        .linkedFramework("AppKit")
      ]
    )
  ]
)
