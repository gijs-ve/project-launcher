/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.gijsbert.launch',
  productName: 'Launch',

  directories: {
    output: 'dist-electron',
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

  // Extra files copied next to the asar archive (accessible via process.resourcesPath)
  extraResources: [
    {
      from: 'client/dist',
      to: 'client',
    },
    {
      from: 'launch.config.json',
      to: 'launch.config.json',
    },
  ],

  // Tell electron-builder the app entry point
  // (also set in package.json "main" field)

  mac: {
    category: 'public.app-category.developer-tools',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    // Drop icon.icns here if you have one: build/icon.icns
  },

  // Rebuild native modules (node-pty) for Electron's Node ABI
  npmRebuild: true,
};
