import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'node_modules', 'three');
const dst = path.join(root, 'electron', 'renderer', 'vendor');
fs.mkdirSync(dst, { recursive: true });
fs.copyFileSync(
  path.join(src, 'build', 'three.module.js'),
  path.join(dst, 'three.module.js')
);
fs.cpSync(
  path.join(src, 'examples', 'jsm'),
  path.join(dst, 'jsm'),
  { recursive: true }
);
console.log('Three.js renderer assets copied.');
