/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.gijsbert.proudlazy',
  productName: 'Proud Lazy',

  directories: {
    output: 'dist-electron',
  },

  // Ensure spawn-helper (node-pty helper binary) is executable after packaging
  afterPack: async (context) => {
    const path = require('path');
    const fs = require('fs');
    const unpackedDir = path.join(
      context.appOutDir,
      'Proud Lazy.app',
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'prebuilds',
    );
    if (!fs.existsSync(unpackedDir)) return;
    for (const arch of fs.readdirSync(unpackedDir)) {
      const helper = path.join(unpackedDir, arch, 'spawn-helper');
      if (fs.existsSync(helper)) {
        fs.chmodSync(helper, 0o755);
        console.log('  • chmod +x', helper);
      }
    }
  },

  // Files bundled into the asar archive
  files: [
    'electron-dist/**',
    'server/dist/**',
    'node_modules/**',
    'package.json',
    '!node_modules/.cache',
    '!**/*.map',
  ],

  // Native .node binaries cannot be loaded from inside an asar archive.
  // Unpack node-pty (and any other native addons) to the unpacked directory.
  asarUnpack: [
    'node_modules/node-pty/**',
    '**/*.node',
  ],

  // Extra files copied next to the asar archive (accessible via process.resourcesPath)
  extraResources: [
    {
      from: 'client/dist',
      to: 'client',
    },
    {
      from: 'launch.config.gizzyb',
      to: 'launch.config.gizzyb',
    },
  ],

  // Tell electron-builder the app entry point
  // (also set in package.json "main" field)

  mac: {
    category: 'public.app-category.developer-tools',
    icon: 'build/icon.icns',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
  },

  // node-pty ships prebuilts for darwin-arm64/x64 that match Electron 33's Node ABI (115).
  // Rebuilding from source fails on macOS with Python 3.12+ (distutils removed).
  // Since the ABI matches, we can skip the rebuild step.
  npmRebuild: false,
};
