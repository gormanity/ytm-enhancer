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
        .copy("Resources/playback-next.svg"),
        .copy("Resources/playback-pause.svg"),
        .copy("Resources/playback-play.svg"),
        .copy("Resources/playback-previous.svg"),
        .copy("Resources/playback-repeat-one.svg"),
        .copy("Resources/playback-repeat.svg"),
        .copy("Resources/playback-shuffle.svg"),
      ],
      linkerSettings: [
        .linkedFramework("AppKit")
      ]
    )
  ]
)
