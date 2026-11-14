// Copies app/ to dist/ and stamps the build's git sha into the <meta name="build"> and the footer (R6).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sha = process.env.BUILD_SHA || execSync('git rev-parse HEAD').toString().trim();
fs.rmSync('dist', { recursive: true, force: true });
fs.cpSync('app', 'dist', { recursive: true });
const html = fs.readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD_SHA__', sha);
fs.writeFileSync('dist/index.html', html);
console.log(`dist/ built at ${sha}`);
