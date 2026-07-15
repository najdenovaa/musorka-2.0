const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withExcludeReactNativeMaps(config) {
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const mapsPath = path.join(
        config.modRequest.projectRoot,
        "node_modules",
        "react-native-maps"
      );
      if (fs.existsSync(mapsPath)) {
        fs.rmSync(mapsPath, { recursive: true, force: true });
        console.log("[withExcludeReactNativeMaps] Removed react-native-maps from node_modules");
      }

      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, "utf-8");

        podfileContent = podfileContent
          .split("\n")
          .filter((line) => {
            const trimmed = line.trim();
            return (
              !trimmed.includes("react-native-maps") &&
              !trimmed.includes("RNMaps")
            );
          })
          .join("\n");

        fs.writeFileSync(podfilePath, podfileContent, "utf-8");
      }

      const rnConfigPath = path.join(
        config.modRequest.projectRoot,
        "react-native.config.js"
      );
      const rnConfig = `module.exports = {
  dependencies: {
    'react-native-maps': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};
`;
      fs.writeFileSync(rnConfigPath, rnConfig, "utf-8");

      return config;
    },
  ]);

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const mapsPath = path.join(
        config.modRequest.projectRoot,
        "node_modules",
        "react-native-maps"
      );
      if (fs.existsSync(mapsPath)) {
        fs.rmSync(mapsPath, { recursive: true, force: true });
        console.log("[withExcludeReactNativeMaps] Removed react-native-maps from node_modules (android)");
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withExcludeReactNativeMaps;
