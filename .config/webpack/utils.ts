import path from 'path';
import { glob } from 'glob';
import fs from 'fs';
import { SOURCE_DIR } from './constants';

export const getPackageJson = () => {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
};

export const getPluginJson = () => {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), SOURCE_DIR, 'plugin.json'), 'utf8'));
};

export const hasReadme = () => {
  return fs.existsSync(path.resolve(process.cwd(), SOURCE_DIR, 'README.md'));
};

export const getEntries = async () => {
  const files = await glob(path.resolve(process.cwd(), SOURCE_DIR, 'module.ts'));
  return files.reduce((acc, cur) => {
    const name = path.basename(cur, path.extname(cur));
    acc[name] = cur;
    return acc;
  }, {} as Record<string, string>);
};
