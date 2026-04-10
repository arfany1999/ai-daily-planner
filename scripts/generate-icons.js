// Run: node scripts/generate-icons.js
// Generates PWA icons as simple PNG files using canvas
// If canvas isn't available, creates placeholder SVGs

const fs = require('fs');
const path = require('path');

const sizes = [192, 512];
const outDir = path.join(__dirname, '..', 'public', 'icons');

for (const size of sizes) {
  // Create a simple SVG icon
  const fontSize = Math.round(size * 0.35);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a7a6d"/>
      <stop offset="100%" style="stop-color:#0d9b8a"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#060608"/>
  <rect x="${Math.round(size * 0.12)}" y="${Math.round(size * 0.12)}" width="${Math.round(size * 0.76)}" height="${Math.round(size * 0.76)}" rx="${Math.round(size * 0.12)}" fill="url(#bg)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${fontSize}" fill="white">AP</text>
</svg>`;

  // Save as SVG (can be converted to PNG with any tool)
  fs.writeFileSync(path.join(outDir, `icon-${size}.svg`), svg);
  console.log(`Created icon-${size}.svg`);
}

console.log('Icons generated. Convert SVGs to PNGs for production.');
console.log('Quick convert: npx svg2png-many public/icons/*.svg');
