#!/usr/bin/env node
// Decides what a push to main does for the customer app, for one store:
//
//   build   – start an EAS store build (EAS auto-submits it)
//   ota     – publish an OTA to our xprem server (Android workflow only; one
//             OTA serves both platforms)
//   nothing – iOS workflow when there is nothing to build
//   submit  – manual re-run only: submit the existing build to the store again
//
// or fails the job with a plain-English ::error:: when going ahead would ship
// something unsafe. The answer comes from state, not from commit messages or
// the last commit's diff: the version numbers in app.json are compared with
// the builds that already exist on EAS, and the project's native fingerprint
// is compared with the fingerprint EAS recorded for the store build(s) that
// phones are running. So a multi-commit push, a merge, a cancelled run or a
// manual re-run all decide the same way.
//
// Why each rule exists:
//   - autoIncrement is off, so app.json's versionCode / buildNumber is exactly
//     what ships. A number EAS already built cannot be uploaded again, so a new
//     store build needs a new number.
//   - runtimeVersion is a literal string. An OTA reaches every binary with the
//     same runtimeVersion, so every store build that changes native code needs
//     a new one, and an OTA must never be published while the code on main has
//     native changes that a binary on that runtimeVersion lacks.
//   - With --no-wait nobody watches the EAS build or its auto-submit. A failed
//     build is reported on the next run instead of being retried on every push
//     (each retry would use one of the free plan's builds). A failed submit is
//     reported too (submit_problem), but does not hold back the OTA: it says
//     nothing about whether the JS is safe to ship.
//
// Usage (from apps/customer-app, EXPO_TOKEN set):
//   node ../../.github/scripts/customer-app-release.js android|ios
// Env: RETRY_FAILED_BUILD=true lets a build start again after a failed one;
//      RETRY_FAILED_SUBMIT=true submits the current build again after a
//      failed submit.

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FAILED = new Set(['ERRORED', 'CANCELED', 'PENDING_CANCEL']);
const SUBMIT_PENDING = new Set(['AWAITING_BUILD', 'IN_QUEUE', 'IN_PROGRESS']);
const STORE = { android: 'Play Store', ios: 'App Store' };
const NUMBER_FIELD = {
  android: 'expo.android.versionCode in app.json',
  ios: 'expo.ios.buildNumber in app.json',
};

// Paths that only matter when EAS has no fingerprint for a build (builds made
// before eas-cli recorded one). Same ground the fingerprint covers.
const NATIVE_PATHS = [
  'android',
  'patches',
  'plugins',
  'app.json',
  'eas.json',
  '.easignore',
  'package.json',
  'package-lock.json',
  'assets/icon',
  'google-services.json',
  'GoogleService-Info.plist',
];

class ReleaseError extends Error {}

const isActive = (b) => !FAILED.has(b.status);
const numberOf = (b) => Number(b.appBuildVersion);
const runtimeOf = (b) => (b.runtime && b.runtime.version) || null;
const buildUrl = (b) =>
  b.app && b.app.ownerAccount
    ? `https://expo.dev/accounts/${b.app.ownerAccount.name}/projects/${b.app.slug}/builds/${b.id}`
    : `build ${b.id}`;

function readConfig(appDir) {
  const { expo } = JSON.parse(fs.readFileSync(path.join(appDir, 'app.json'), 'utf8'));
  const config = {
    version: expo.version,
    runtimeVersion: expo.runtimeVersion,
    android: Number(expo.android && expo.android.versionCode),
    ios: Number(expo.ios && expo.ios.buildNumber),
  };
  if (typeof config.runtimeVersion !== 'string' || !config.runtimeVersion) {
    throw new ReleaseError('expo.runtimeVersion in app.json must be a plain string like "1.9.10".');
  }
  for (const p of ['android', 'ios']) {
    if (!Number.isInteger(config[p]) || config[p] < 1) {
      throw new ReleaseError(`${NUMBER_FIELD[p]} must be a whole number.`);
    }
  }
  const gradlePath = path.join(appDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    const gradle = fs.readFileSync(gradlePath, 'utf8');
    const code = gradle.match(/^\s*versionCode\s+(\d+)/m);
    const name = gradle.match(/^\s*versionName\s+"([^"]+)"/m);
    config.gradle = {
      versionCode: code ? Number(code[1]) : null,
      versionName: name ? name[1] : null,
    };
    const stringsPath = path.join(appDir, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
    if (fs.existsSync(stringsPath)) {
      const rt = fs.readFileSync(stringsPath, 'utf8').match(/name="expo_runtime_version">([^<]*)</);
      config.gradle.runtimeVersion = rt ? rt[1] : null;
    }
  }
  return config;
}

// Can an OTA built from this commit go to every phone on `runtime` for
// `platform`? Every store build still alive on that runtime must have been
// built from the same native fingerprint the project has now.
async function checkOtaSafe(platform, { config, builds, getLocalFingerprint, nativeChangedSince }) {
  const live = builds[platform].filter((b) => isActive(b) && runtimeOf(b) === config.runtimeVersion);
  const problems = [];
  for (const b of live) {
    if (b.fingerprint && b.fingerprint.hash) {
      const local = await getLocalFingerprint(platform);
      if (local !== b.fingerprint.hash) {
        problems.push({ build: b, reason: 'native code or native config changed since this build' });
      }
    } else if (b.gitCommitHash) {
      if (await nativeChangedSince(b.gitCommitHash)) {
        problems.push({ build: b, reason: `native files changed since commit ${b.gitCommitHash.slice(0, 8)}` });
      }
    } else {
      problems.push({ build: b, reason: 'EAS has neither a fingerprint nor a commit for this build' });
    }
  }
  return problems;
}

function nativeChangedMessage(problems, config) {
  const lines = problems.map(
    ({ build, reason }) =>
      `${STORE[build.platform.toLowerCase()] || build.platform} build ${build.appBuildVersion} (runtime ${runtimeOf(build)}): ${reason} – ${buildUrl(build)}`
  );
  return [
    `Native code changed since the store build(s) running runtimeVersion ${config.runtimeVersion}, so an OTA now could crash those phones.`,
    ...lines,
    'Ship it as a store release: in apps/customer-app bump expo.version and expo.runtimeVersion,',
    'expo.android.versionCode and expo.ios.buildNumber in app.json, and versionCode/versionName in',
    'android/app/build.gradle, then push. Nothing was built or published.',
  ].join('\n');
}

// Did the store upload of `build` go through? Returns a problem string, or ''
// when it is fine or still running. Order-independent: any finished or
// pending submission counts as fine.
async function checkSubmit(platform, build, getSubmissions) {
  if (build.status !== 'FINISHED') return '';
  const subs = await getSubmissions(build.id);
  if (subs.some((s) => s.status === 'FINISHED' || SUBMIT_PENDING.has(s.status))) return '';
  const where = `${STORE[platform]} build ${build.appBuildVersion} (${buildUrl(build)})`;
  if (subs.length === 0) return `${where} was never submitted to the ${STORE[platform]}.`;
  const last = subs[subs.length - 1];
  const why = last.error && last.error.message ? `: ${last.error.message}` : '';
  return `The ${STORE[platform]} upload of ${where} ended as ${last.status}${why}`;
}

// Pure decision. `builds` holds production-profile builds per platform, newest
// first, as `eas build:list --json` returns them.
async function decide({
  platform,
  retryFailedBuild,
  retryFailedSubmit,
  config,
  builds,
  getLocalFingerprint,
  nativeChangedSince,
  getSubmissions,
}) {
  const ctx = { config, builds, getLocalFingerprint, nativeChangedSince };
  const number = config[platform];
  const own = builds[platform];
  const sameNumber = own.filter((b) => numberOf(b) === number);
  const active = sameNumber.filter(isActive);

  if (active.length === 0) {
    if (sameNumber.length > 0 && !retryFailedBuild) {
      const last = sameNumber[0];
      const why = last.error && last.error.message ? `: ${last.error.message}` : '';
      throw new ReleaseError(
        [
          `The ${STORE[platform]} build for ${number} ended as ${last.status}${why}`,
          buildUrl(last),
          'Fix the cause, then re-run it from GitHub: Actions → this workflow → Run workflow,',
          'tick "Start the store build again after a failed one". Nothing was built or published.',
        ].join('\n')
      );
    }

    const used = own.filter(isActive).map(numberOf).filter(Number.isFinite);
    const maxUsed = used.length ? Math.max(...used) : 0;
    if (number <= maxUsed) {
      throw new ReleaseError(
        `${NUMBER_FIELD[platform]} is ${number}, but EAS already built ${maxUsed}. Set it to ${maxUsed + 1} or higher. Nothing was built or published.`
      );
    }
    const previous = own.find(isActive);
    if (previous && runtimeOf(previous) === config.runtimeVersion) {
      throw new ReleaseError(
        [
          `${NUMBER_FIELD[platform]} went up to ${number}, but expo.runtimeVersion is still ${config.runtimeVersion},`,
          `the same as store build ${previous.appBuildVersion}. A new store build needs a new runtimeVersion too,`,
          'or OTAs meant for the new app would also reach the old one. Nothing was built or published.',
        ].join('\n')
      );
    }
    if (platform === 'android' && config.gradle) {
      const { versionCode, versionName } = config.gradle;
      if (versionCode !== number || versionName !== config.version) {
        throw new ReleaseError(
          [
            `android/ is committed, so the Android build takes its version from android/app/build.gradle,`,
            `which says versionCode ${versionCode} / versionName "${versionName}" while app.json says`,
            `${number} / "${config.version}". Make them match. Nothing was built or published.`,
          ].join('\n')
        );
      }
      if ('runtimeVersion' in config.gradle && config.gradle.runtimeVersion !== config.runtimeVersion) {
        throw new ReleaseError(
          [
            `android/app/src/main/res/values/strings.xml has expo_runtime_version ${config.gradle.runtimeVersion},`,
            `but app.json has runtimeVersion ${config.runtimeVersion}. Run in apps/customer-app:`,
            'npx expo-updates configuration:syncnative --platform android --workflow generic',
            'and commit the result. Nothing was built or published.',
          ].join('\n')
        );
      }
    }
    return { decision: 'build', reason: `no ${STORE[platform]} build exists yet for ${number}` };
  }

  const current = active[0];
  if (runtimeOf(current) && runtimeOf(current) !== config.runtimeVersion) {
    throw new ReleaseError(
      [
        `expo.runtimeVersion is ${config.runtimeVersion}, but ${STORE[platform]} build ${number} already exists`,
        `with runtime ${runtimeOf(current)} (${buildUrl(current)}). For a new store release bump`,
        `${NUMBER_FIELD[platform]} as well; otherwise put runtimeVersion back. Nothing was built or published.`,
      ].join('\n')
    );
  }

  // OTAs are published by the Android workflow only, for both platforms, so it
  // checks both. The iOS workflow checks its own platform to report problems.
  const platformsToCheck = platform === 'android' ? ['android', 'ios'] : ['ios'];
  const problems = [];
  for (const p of platformsToCheck) {
    problems.push(...(await checkOtaSafe(p, ctx)));
  }
  if (problems.length > 0) {
    const err = new ReleaseError(nativeChangedMessage(problems, config));
    err.problems = problems;
    throw err;
  }

  const submitProblem = await checkSubmit(platform, current, getSubmissions);
  if (submitProblem && retryFailedSubmit) {
    return { decision: 'submit', buildId: current.id, reason: submitProblem, submitProblem: '' };
  }
  if (platform === 'android') {
    return {
      decision: 'ota',
      reason: `store build ${number} (${current.status}) matches the native code; JS-only change`,
      submitProblem,
    };
  }
  return {
    decision: 'nothing',
    reason: `App Store build ${number} already exists and matches the native code`,
    submitProblem,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function eas(args) {
  return execFileSync('eas', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

// eas-cli has no command that lists a build's submissions, so ask the same
// GraphQL API it uses (BuildQuery.withSubmissionsByIdAsync), with the same
// auth: EXPO_TOKEN in CI, the `eas login` session for a local run.
async function getSubmissions(buildId) {
  const headers = { 'content-type': 'application/json' };
  if (process.env.EXPO_TOKEN) {
    headers.authorization = `Bearer ${process.env.EXPO_TOKEN}`;
  } else {
    const state = path.join(require('os').homedir(), '.expo', 'state.json');
    headers['expo-session'] = JSON.parse(fs.readFileSync(state, 'utf8')).auth.sessionSecret;
  }
  const res = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `query ($buildId: ID!) {
        builds { byId(buildId: $buildId) { id submissions { id status error { errorCode message } } } }
      }`,
      variables: { buildId },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(`Expo API ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  }
  return body.data.builds.byId.submissions || [];
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    const delim = `EOF_${Math.random().toString(36).slice(2)}`;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delim}\n${value}\n${delim}\n`);
  }
  console.log(`${name}=${value}`);
}

async function main() {
  const platform = process.argv[2];
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error('usage: customer-app-release.js android|ios');
  }
  const appDir = process.cwd();
  const config = readConfig(appDir);

  const builds = {};
  for (const p of ['android', 'ios']) {
    const list = JSON.parse(
      eas(['build:list', '--platform', p, '--build-profile', 'production', '--limit', '50', '--json', '--non-interactive'])
    );
    builds[p] = list
      .filter((b) => !b.isForIosSimulator)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  const fingerprints = {};
  const getLocalFingerprint = async (p) => {
    if (!fingerprints[p]) {
      const out = JSON.parse(
        eas(['fingerprint:generate', '--platform', p, '--build-profile', 'production', '--json', '--non-interactive'])
      );
      fingerprints[p] = out.hash;
      console.log(`Local ${p} fingerprint: ${out.hash}`);
    }
    return fingerprints[p];
  };
  const nativeChangedSince = async (commit) => {
    try {
      execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' });
    } catch {
      return true; // not in history: cannot prove nothing changed
    }
    const out = execFileSync('git', ['diff', '--name-only', commit, 'HEAD', '--', ...NATIVE_PATHS], {
      encoding: 'utf8',
    });
    return out.trim().length > 0;
  };

  console.log(
    `app.json: version ${config.version}, runtimeVersion ${config.runtimeVersion}, versionCode ${config.android}, buildNumber ${config.ios}`
  );
  for (const p of ['android', 'ios']) {
    const latest = builds[p][0];
    console.log(
      latest
        ? `Latest ${p} build on EAS: ${latest.appBuildVersion} (${latest.status}, runtime ${runtimeOf(latest)})`
        : `No ${p} production builds on EAS`
    );
  }

  let result;
  try {
    result = await decide({
      platform,
      retryFailedBuild: process.env.RETRY_FAILED_BUILD === 'true',
      retryFailedSubmit: process.env.RETRY_FAILED_SUBMIT === 'true',
      config,
      builds,
      getLocalFingerprint,
      nativeChangedSince,
      // A failed lookup must not hold back an OTA that is otherwise safe.
      getSubmissions: async (id) => {
        try {
          return await getSubmissions(id);
        } catch (err) {
          console.log(`::warning::Could not check the store submit on Expo: ${err.message}`);
          return [{ status: 'FINISHED' }];
        }
      },
    });
  } catch (err) {
    if (err instanceof ReleaseError && err.problems) {
      // Show what changed, so the error is not a black box.
      for (const { build } of err.problems) {
        if (!build.fingerprint) continue;
        console.log(`\nFingerprint diff against ${build.platform} build ${build.appBuildVersion}:`);
        try {
          console.log(eas(['fingerprint:compare', '--build-id', build.id, '--non-interactive']));
        } catch {
          console.log('(could not print the diff)');
        }
      }
    }
    throw err;
  }

  console.log(`Decision: ${result.decision} (${result.reason})`);
  setOutput('decision', result.decision);
  setOutput('build_id', result.buildId || '');
  setOutput('submit_problem', result.submitProblem || '');
  // Subject of the newest non-merge commit, so an OTA is never labelled
  // "Merge branch …".
  const message = execFileSync('git', ['log', '-1', '--no-merges', '--format=%s'], { encoding: 'utf8' }).trim();
  setOutput('ota_message', message || 'auto-update from main');
}

if (require.main === module) {
  main().catch((err) => {
    for (const line of String(err.message).split('\n')) console.log(`::error::${line}`);
    process.exit(1);
  });
}

module.exports = { decide, readConfig, getSubmissions, ReleaseError };
