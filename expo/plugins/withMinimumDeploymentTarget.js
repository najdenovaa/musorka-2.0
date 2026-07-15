const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withMinimumDeploymentTarget(config, { iosVersion = "13.4", swiftVersion = "5.9" } = {}) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, "utf-8");

        const swiftAndDeploymentSnippet = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && current.to_f < ${iosVersion}
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${iosVersion}'
        end
        config.build_settings['SWIFT_VERSION'] = '${swiftVersion}'
      end
    end`;

        if (!podfileContent.includes("config.build_settings['SWIFT_VERSION']")) {
          if (podfileContent.includes("post_install do |installer|")) {
            podfileContent = podfileContent.replace(
              "post_install do |installer|",
              `post_install do |installer|${swiftAndDeploymentSnippet}`
            );
          } else {
            podfileContent += `\npost_install do |installer|${swiftAndDeploymentSnippet}\nend\n`;
          }
        }

        fs.writeFileSync(podfilePath, podfileContent, "utf-8");
      }

      return config;
    },
  ]);
}

module.exports = withMinimumDeploymentTarget;
