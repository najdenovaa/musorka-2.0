/**
 * expo-modules-core removed FileSystemUtilities.isReadableFile; older
 * expo-image-manipulator still referenced it and fails Xcode compile.
 * Runs after every install so CI/EAS always sees patched Swift.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-image-manipulator',
  'ios',
  'ImageManipulatorUtils.swift'
);

const pattern =
  /FileSystemUtilities\.isReadableFile\s*\(\s*([A-Za-z_][\w$]*)\s*,\s*([A-Za-z_][\w$]*)\s*\)/g;

function main() {
  if (!fs.existsSync(target)) {
    console.log(
      '[patch-expo-image-manipulator] Skip: expo-image-manipulator Swift sources not installed yet'
    );
    return;
  }
  const original = fs.readFileSync(target, 'utf8');
  const updated = original.replace(
    pattern,
    'FileSystemUtilities.permissions($1, for: $2).contains(.read) && FileManager.default.isReadableFile(atPath: $2.path)'
  );
  if (updated !== original) {
    fs.writeFileSync(target, updated, 'utf8');
    console.log(
      '[patch-expo-image-manipulator] Patched ImageManipulatorUtils.swift (isReadableFile → permissions + FileManager)'
    );
  }
}

main();
