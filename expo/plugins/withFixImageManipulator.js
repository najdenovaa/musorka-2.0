const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const podfilePatchMarker = "image_manipulator_file = File.join(File.dirname(__dir__), 'node_modules', 'expo-image-manipulator', 'ios', 'ImageManipulatorUtils.swift')";
const readableFilePattern =
  /FileSystemUtilities\.isReadableFile\s*\(\s*([A-Za-z_][\w$]*)\s*,\s*([A-Za-z_][\w$]*)\s*\)/g;
const readableFileReplacement = 'FileSystemUtilities.permissions($1, for: $2).contains(.read) && FileManager.default.isReadableFile(atPath: $2.path)';

function withFixImageManipulator(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformProjectRoot = config.modRequest.platformProjectRoot;

      patchInstalledImageManipulator(projectRoot);
      ensurePodfilePatch(path.join(platformProjectRoot, 'Podfile'));

      return config;
    },
  ]);
}

function patchInstalledImageManipulator(projectRoot) {
  const targetFile = path.join(
    projectRoot,
    'node_modules',
    'expo-image-manipulator',
    'ios',
    'ImageManipulatorUtils.swift'
  );

  if (!fs.existsSync(targetFile)) {
    console.log('[withFixImageManipulator] ImageManipulatorUtils.swift not found in node_modules, deferring to Podfile patch');
    return;
  }

  const didPatch = patchSwiftFile(targetFile);
  console.log(
    didPatch
      ? '[withFixImageManipulator] Patched installed ImageManipulatorUtils.swift'
      : '[withFixImageManipulator] Installed ImageManipulatorUtils.swift is already compatible'
  );
}

function patchSwiftFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf-8');
  const updated = original.replace(readableFilePattern, readableFileReplacement);

  if (updated === original) {
    return false;
  }

  fs.writeFileSync(filePath, updated, 'utf-8');
  return true;
}

function ensurePodfilePatch(podfilePath) {
  if (!fs.existsSync(podfilePath)) {
    console.log('[withFixImageManipulator] Podfile not found yet, skipping Podfile patch');
    return;
  }

  let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

  if (podfileContent.includes(podfilePatchMarker)) {
    console.log('[withFixImageManipulator] Podfile patch already present');
    return;
  }

  const rubySnippet = `
    begin
      image_manipulator_file = File.join(File.dirname(__dir__), 'node_modules', 'expo-image-manipulator', 'ios', 'ImageManipulatorUtils.swift')
      if File.exist?(image_manipulator_file)
        image_manipulator_content = File.read(image_manipulator_file)
        patched_image_manipulator_content = image_manipulator_content.gsub(
          /FileSystemUtilities\.isReadableFile\s*\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\)/
        ) { "FileSystemUtilities.permissions(#{$1}, for: #{$2}).contains(.read) && FileManager.default.isReadableFile(atPath: #{$2}.path)" }

        if patched_image_manipulator_content != image_manipulator_content
          File.write(image_manipulator_file, patched_image_manipulator_content)
          Pod::UI.puts('[withFixImageManipulator] Patched ImageManipulatorUtils.swift during pod install')
        else
          Pod::UI.puts('[withFixImageManipulator] ImageManipulatorUtils.swift already compatible during pod install')
        end
      else
        Pod::UI.puts('[withFixImageManipulator] ImageManipulatorUtils.swift not found during pod install')
      end
    rescue => error
      Pod::UI.warn("[withFixImageManipulator] Failed to patch ImageManipulatorUtils.swift: #{error}")
    end`;

  if (podfileContent.includes('post_install do |installer|')) {
    podfileContent = podfileContent.replace(
      'post_install do |installer|',
      `post_install do |installer|${rubySnippet}`
    );
  } else {
    podfileContent += `\npost_install do |installer|${rubySnippet}\nend\n`;
  }

  fs.writeFileSync(podfilePath, podfileContent, 'utf-8');
  console.log('[withFixImageManipulator] Added Podfile patch for ImageManipulatorUtils.swift');
}

module.exports = withFixImageManipulator;
