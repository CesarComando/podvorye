// Значки приложения из одного SVG: npm run icons
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const ear = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <path d="M0 98V18" stroke="#2E6F30" stroke-width="3" stroke-linecap="round" fill="none"/>
  <g fill="#F2C445">
    <ellipse cx="0" cy="12" rx="4.5" ry="9.5"/>
    ${[26, 39, 52, 65].map((cy) => `<ellipse cx="-7" cy="${cy}" rx="4.5" ry="9" transform="rotate(-28 -7 ${cy})"/><ellipse cx="7" cy="${cy}" rx="4.5" ry="9" transform="rotate(28 7 ${cy})"/>`).join('')}
  </g></g>`

// pad — внутренний отступ (для «маскируемого» значка Android содержимое должно быть в центральных 80%)
const svg = (pad) => {
  const k = 1 - pad * 2, o = 512 * pad
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#3A8A3C"/>
  <g transform="translate(${o} ${o}) scale(${k})">
    <defs><clipPath id="c"><circle cx="256" cy="256" r="230"/></clipPath></defs>
    <circle cx="256" cy="256" r="230" fill="#4C9C45"/>
    <path d="M0 360 Q150 300 256 340 T512 330 V512 H0 Z" fill="#86BC5A" clip-path="url(#c)"/>
    <rect x="150" y="215" width="212" height="160" rx="6" fill="#FFFFFF"/>
    <path d="M124 228 L256 120 L388 228 Z" fill="#2E6F30"/>
    <circle cx="256" cy="185" r="16" fill="#F2C445" stroke="#FFFFFF" stroke-width="5"/>
    <rect x="214" y="268" width="84" height="107" fill="#F2C445" stroke="#FFFFFF" stroke-width="6"/>
    <path d="M214 268 L298 375 M298 268 L214 375" stroke="#FFFFFF" stroke-width="7"/>
    ${ear(108, 250, 1.5, -12)}${ear(404, 250, 1.5, 12)}
  </g></svg>`
}

mkdirSync('public', { recursive: true })
const out = async (file, size, pad) => sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile('public/' + file)
await out('pwa-192x192.png', 192, 0.02)
await out('pwa-512x512.png', 512, 0.02)
await out('maskable-512x512.png', 512, 0.12)
await out('apple-touch-icon.png', 180, 0.06)
await out('favicon.png', 64, 0)
console.log('icons ok')
