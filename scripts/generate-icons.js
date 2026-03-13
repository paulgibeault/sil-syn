/**
 * Generate all icon sizes from icon.svg
 * Run: node scripts/generate-icons.js
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';

const SIZES = [
  // Apple touch icons
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 167, name: 'apple-touch-icon-167.png' },
  { size: 152, name: 'apple-touch-icon-152.png' },
  // Manifest icons
  { size: 512, name: 'icons/icon-512.png' },
  { size: 384, name: 'icons/icon-384.png' },
  { size: 192, name: 'icons/icon-192.png' },
  { size: 96, name: 'icons/icon-96.png' },
  // Favicon
  { size: 32, name: 'favicon-32.png' },
  { size: 16, name: 'favicon-16.png' },
];

const input = 'public/icon.svg';
const outDir = 'public';

mkdirSync(`${outDir}/icons`, { recursive: true });

for (const { size, name } of SIZES) {
  await sharp(input, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(`${outDir}/${name}`);
  console.log(`  ${size}x${size} -> ${name}`);
}

// Also create a 32x32 ICO-compatible PNG as favicon.ico fallback
await sharp(input, { density: 300 })
  .resize(32, 32)
  .png()
  .toFile(`${outDir}/favicon.png`);
console.log('  32x32 -> favicon.png');

console.log('Done.');
