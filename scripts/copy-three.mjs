import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'electron', 'node_modules', 'three');
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

const loaderPath = path.join(dst, 'jsm', 'loaders', 'GLTFLoader.js');
let loader = fs.readFileSync(loaderPath, 'utf8');
loader = loader.replaceAll("from 'three'", "from '../../three.module.js'");
loader = loader.replaceAll('from "three"', 'from "../../three.module.js"');
fs.writeFileSync(loaderPath, loader);
console.log('Three.js renderer assets copied and loader imports made local.');
