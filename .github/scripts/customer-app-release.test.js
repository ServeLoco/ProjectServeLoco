// node --test .github/scripts/
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { decide, ReleaseError } = require('./customer-app-release');

const config = (over = {}) => ({
  version: '1.9.10',
  runtimeVersion: '1.9.10',
  android: 48,
  ios: 19,
  gradle: { versionCode: 48, versionName: '1.9.10', runtimeVersion: '1.9.10' },
  ...over,
});

let seq = 0;
const build = (platform, number, over = {}) => ({
  id: `b${++seq}`,
  platform: platform.toUpperCase(),
  status: 'FINISHED',
  appBuildVersion: String(number),
  runtime: { version: '1.9.10' },
  fingerprint: { hash: `fp-${platform}` },
  gitCommitHash: 'abc123',
  createdAt: `2026-10-${String(10 + (seq % 20)).padStart(2, '0')}T00:00:00Z`,
  app: { slug: 'villkro', ownerAccount: { name: 'yashsiwch' } },
  ...over,
});

const run = (over) =>
  decide({
    platform: 'android',
    retryFailedBuild: false,
    config: config(),
    builds: { android: [build('android', 48)], ios: [build('ios', 19)] },
    getLocalFingerprint: async (p) => `fp-${p}`,
    nativeChangedSince: async () => false,
    getSubmissions: async () => [{ status: 'FINISHED' }],
    ...over,
  });

const rejectsWith = (promise, re) =>
  assert.rejects(promise, (err) => err instanceof ReleaseError && re.test(err.message));

test('JS-only change on an existing build publishes an OTA', async () => {
  assert.strictEqual((await run()).decision, 'ota');
});

test('iOS workflow does nothing when its build exists and matches', async () => {
  assert.strictEqual((await run({ platform: 'ios' })).decision, 'nothing');
});

test('native change without new numbers blocks the OTA', async () => {
  await rejectsWith(run({ getLocalFingerprint: async (p) => (p === 'android' ? 'changed' : 'fp-ios') }), /Native code changed/);
});

test('iOS-only native change also blocks the OTA (it reaches iPhones too)', async () => {
  await rejectsWith(run({ getLocalFingerprint: async (p) => (p === 'ios' ? 'changed' : 'fp-android') }), /App Store build 19/);
});

test('falls back to git when EAS has no fingerprint', async () => {
  const builds = { android: [build('android', 48, { fingerprint: null })], ios: [build('ios', 19)] };
  assert.strictEqual((await run({ builds })).decision, 'ota');
  await rejectsWith(run({ builds, nativeChangedSince: async () => true }), /native files changed since commit/);
});

test('new numbers with a new runtimeVersion start a store build', async () => {
  const c = config({ android: 49, ios: 20, runtimeVersion: '1.9.11', version: '1.9.11', gradle: { versionCode: 49, versionName: '1.9.11', runtimeVersion: '1.9.11' } });
  assert.strictEqual((await run({ config: c })).decision, 'build');
  assert.strictEqual((await run({ config: c, platform: 'ios' })).decision, 'build');
});

test('new number but same runtimeVersion is refused', async () => {
  const c = config({ android: 49, gradle: { versionCode: 49, versionName: '1.9.10' } });
  await rejectsWith(run({ config: c }), /runtimeVersion is still 1\.9\.10/);
});

test('number not above the highest one EAS built is refused', async () => {
  const c = config({ android: 47, runtimeVersion: '1.9.11', version: '1.9.11', gradle: { versionCode: 47, versionName: '1.9.11' } });
  await rejectsWith(run({ config: c }), /already built 48\. Set it to 49/);
});

test('build.gradle out of step with app.json is refused', async () => {
  const c = config({ android: 49, runtimeVersion: '1.9.11', version: '1.9.11' });
  await rejectsWith(run({ config: c }), /build\.gradle/);
});

test('runtimeVersion changed without a new number is refused', async () => {
  await rejectsWith(run({ config: config({ runtimeVersion: '1.9.11' }) }), /already exists\s+with runtime 1\.9\.10/);
});

test('a failed build is reported, not retried', async () => {
  const c = config({ android: 49, runtimeVersion: '1.9.11', version: '1.9.11', gradle: { versionCode: 49, versionName: '1.9.11', runtimeVersion: '1.9.11' } });
  const builds = {
    android: [build('android', 49, { status: 'ERRORED', runtime: { version: '1.9.11' }, error: { message: 'Gradle failed' } }), build('android', 48)],
    ios: [build('ios', 19)],
  };
  await rejectsWith(run({ config: c, builds }), /ended as ERRORED: Gradle failed/);
  assert.strictEqual((await run({ config: c, builds, retryFailedBuild: true })).decision, 'build');
});

test('a build still in the queue counts: no second build, OTA allowed when native matches', async () => {
  const c = config({ android: 49, ios: 20, runtimeVersion: '1.9.11', version: '1.9.11', gradle: { versionCode: 49, versionName: '1.9.11', runtimeVersion: '1.9.11' } });
  const builds = {
    android: [build('android', 49, { status: 'IN_QUEUE', runtime: { version: '1.9.11' } }), build('android', 48)],
    ios: [build('ios', 20, { status: 'IN_PROGRESS', runtime: { version: '1.9.11' } }), build('ios', 19)],
  };
  assert.strictEqual((await run({ config: c, builds })).decision, 'ota');
  assert.strictEqual((await run({ config: c, builds, platform: 'ios' })).decision, 'nothing');
});

test('old binaries on another runtime do not block an OTA for the new runtime', async () => {
  const c = config({ android: 49, ios: 20, runtimeVersion: '1.9.11', version: '1.9.11', gradle: { versionCode: 49, versionName: '1.9.11', runtimeVersion: '1.9.11' } });
  const builds = {
    android: [build('android', 49, { runtime: { version: '1.9.11' } }), build('android', 48, { fingerprint: { hash: 'old' } })],
    ios: [build('ios', 20, { runtime: { version: '1.9.11' } }), build('ios', 19, { fingerprint: { hash: 'old' } })],
  };
  assert.strictEqual((await run({ config: c, builds })).decision, 'ota');
});

test('OTA is fine when iOS has no binary on this runtime yet (its build failed)', async () => {
  const c = config({ android: 49, ios: 20, runtimeVersion: '1.9.11', version: '1.9.11', gradle: { versionCode: 49, versionName: '1.9.11', runtimeVersion: '1.9.11' } });
  const builds = {
    android: [build('android', 49, { runtime: { version: '1.9.11' } })],
    ios: [build('ios', 20, { status: 'ERRORED', runtime: { version: '1.9.11' }, fingerprint: { hash: 'whatever' } }), build('ios', 19)],
  };
  assert.strictEqual((await run({ config: c, builds })).decision, 'ota');
});

test('a failed store upload is reported but the OTA still goes out', async () => {
  const r = await run({ getSubmissions: async () => [{ status: 'ERRORED', error: { message: 'Google Api Error: forbidden' } }] });
  assert.strictEqual(r.decision, 'ota');
  assert.match(r.submitProblem, /Play Store upload of Play Store build 48 .* ended as ERRORED: Google Api Error: forbidden/);
});

test('a build that was never submitted is reported', async () => {
  const r = await run({ platform: 'ios', getSubmissions: async () => [] });
  assert.strictEqual(r.decision, 'nothing');
  assert.match(r.submitProblem, /never submitted to the App Store/);
});

test('a later successful re-submit clears the problem', async () => {
  const r = await run({ getSubmissions: async () => [{ status: 'ERRORED' }, { status: 'FINISHED' }] });
  assert.strictEqual(r.submitProblem, '');
});

test('a submit still waiting for its build is fine', async () => {
  const builds = { android: [build('android', 48, { status: 'IN_PROGRESS' })], ios: [build('ios', 19)] };
  let asked = false;
  const r = await run({ builds, getSubmissions: async () => { asked = true; return []; } });
  assert.strictEqual(r.decision, 'ota');
  assert.strictEqual(r.submitProblem || '', '');
  assert.strictEqual(asked, false);
});

test('retry_failed_submit re-submits the existing build instead', async () => {
  const r = await run({ retryFailedSubmit: true, getSubmissions: async () => [{ status: 'CANCELED' }] });
  assert.strictEqual(r.decision, 'submit');
  assert.match(r.buildId, /^b\d+$/);
});

test('retry_failed_submit does nothing special when the submit was fine', async () => {
  assert.strictEqual((await run({ retryFailedSubmit: true })).decision, 'ota');
});

test('strings.xml runtime out of step with app.json is refused', async () => {
  const c = config({ android: 49, runtimeVersion: '1.9.11', version: '1.9.11', gradle: { versionCode: 49, versionName: '1.9.11', runtimeVersion: '1.9.10' } });
  await rejectsWith(run({ config: c }), /strings\.xml has expo_runtime_version 1\.9\.10/);
});
