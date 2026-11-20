import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '@remotion/cli/config';

const pkgDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(pkgDir, '..', '..');

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    },
    alias: {
      ...config.resolve?.alias,
      '@post/core': path.join(workspaceRoot, 'packages', 'core', 'src', 'shared.ts'),
    },
  },
}));
