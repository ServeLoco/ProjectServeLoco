#!/usr/bin/env node
// Gets the phone ready before `npm start` / `npm run android`:
//
// 1. If no device is attached, finds the phone on the Wi-Fi and connects to it.
//    Android's Wireless debugging announces itself over mDNS, so the phone
//    needs no USB cable — only Wireless debugging switched on.
// 2. Forwards the phone's localhost:3000 (API) and :8081 (Metro) to this
//    machine, so a physical Android device reaches both without WiFi/LAN config.
//
// Silently no-ops if adb or a device isn't present (emulator, iOS, CI, etc).
const { execSync } = require('child_process');

const PORTS = [3000, 8081];

function run(cmd) {
  // The timeout stops a Wi-Fi phone that has just gone away from hanging the start.
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
}

function devicesIn(state) {
  return run('adb devices')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(`\t${state}`))
    .map((line) => line.split('\t')[0]);
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Wireless debugging lists itself as "<name>  _adb-tls-connect._tcp  <ip>:<port>".
// The port changes every time it is switched on or the phone restarts, so look
// it up on every run instead of keeping it anywhere.
function connectOverWifi() {
  // An earlier Wi-Fi connection on an old port stays behind as "offline".
  for (const serial of devicesIn('offline')) {
    if (serial.includes(':')) run(`adb disconnect ${serial}`);
  }

  let services = '';
  // adb needs a moment to hear the phone's announcement after it starts.
  for (let attempt = 0; attempt < 3 && !services.includes('_adb-tls-connect'); attempt += 1) {
    if (attempt > 0) pause(1000);
    services = run('adb mdns services');
  }

  const addresses = services
    .split('\n')
    .filter((line) => line.includes('_adb-tls-connect._tcp'))
    .map((line) => line.trim().split(/\s+/).pop());

  for (const address of addresses) {
    try {
      console.log(`[adb wifi] ${run(`adb connect ${address}`).trim()}`);
    } catch {
      // Not reachable or not trusted; try the next one.
    }
  }
}

try {
  let devices = devicesIn('device');
  if (devices.length === 0) {
    connectOverWifi();
    devices = devicesIn('device');
  }

  if (devices.length === 0) {
    process.exit(0);
  }

  for (const serial of devices) {
    for (const port of PORTS) {
      run(`adb -s ${serial} reverse tcp:${port} tcp:${port}`);
    }
    console.log(`[adb reverse] tcp:${PORTS.join(', tcp:')} forwarded on ${serial}`);
  }
} catch {
  // adb not installed, no device, or reverse failed — dev can still fall back
  // to a LAN IP in .env.development, so don't block the start script on this.
  process.exit(0);
}
