#!/usr/bin/env node
// Forwards the phone's localhost:3000 to the dev machine's localhost:3000 over USB,
// so a physical Android device can reach the API server without WiFi/LAN config.
// Runs automatically before `npm start`/`npm run android`; silently no-ops if adb
// or a USB-connected device isn't present (emulator, iOS, CI, etc).
const { execSync } = require('child_process');

const PORT = 3000;

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

try {
  const devices = run('adb devices')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'));

  if (devices.length === 0) {
    process.exit(0);
  }

  for (const line of devices) {
    const serial = line.split('\t')[0];
    run(`adb -s ${serial} reverse tcp:${PORT} tcp:${PORT}`);
    console.log(`[adb reverse] tcp:${PORT} -> tcp:${PORT} forwarded on ${serial}`);
  }
} catch {
  // adb not installed, no device, or reverse failed — dev can still fall back
  // to a LAN IP in .env.development, so don't block the start script on this.
  process.exit(0);
}
