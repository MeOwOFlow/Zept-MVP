import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const svgPath = resolve(root, 'public/icon.svg');
const svgBuffer = readFileSync(svgPath);

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon-180.png', size: 180 },
  { name: 'apple-touch-icon-167.png', size: 167 },
  { name: 'apple-touch-icon-152.png', size: 152 },
  { name: 'apple-touch-icon-120.png', size: 120 },
  { name: 'favicon-32.png', size: 32 },
];

for (const { name, size } of sizes) {
  const resvg = new Resvg(svgBuffer, {
    fitTo: { mode: 'width', value: size },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Microsoft YaHei',
    },
  });
  const pngBuffer = resvg.render().asPng();
  const outPath = resolve(root, 'public', name);
  writeFileSync(outPath, pngBuffer);
  console.log(`Generated: public/${name} (${size}x${size})`);
}

console.log('All icons generated.');
