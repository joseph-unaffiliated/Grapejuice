const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const zustandMiddlewareCjs = path.resolve(__dirname, 'node_modules/zustand/middleware.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'zustand/middleware') {
    return { type: 'sourceFile', filePath: zustandMiddlewareCjs };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
