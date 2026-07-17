# upload-instruction.md — how to push customer-app updates (OTA vs full rebuild)

Instruction spec for whichever AI push VillKro customer-app changes to production. Read fully before touching `apps/customer-app`. This covers: what counts OTA vs major rebuild, how CI auto-detect bump type, commit message rule, version bump rule, manual override.

## 1. Two kinds of release

**OTA update (minor)** — pure JS/asset change. No native code touch. Fast, no Play Store review, ships in minutes.
- Examples: screen/UI change, new component, bugfix in `.js` file, new business logic, style tweak, API call change (client side only), new npm JS-only package that has no native module.

**Major rebuild** — native binary change. Needs new `.aab` submitted to Play Store, review wait (hours-days).
- Examples: new native module / new dependency with native code (anything under `plugins` in `app.json`, native SDKs like `@rnmapbox/maps`, `@react-native-firebase/*`), `app.json` native config change (permissions, icons, splash, `versionCode`, plugin config), Android/iOS project files touched, upgrading Expo SDK, any `apps/customer-app/package.json` dependency change (CI treats ANY package.json diff as major — even a JS-only lib bump).

If unsure whether a change is native: if it needs `expo prebuild` or touches `android/`/`ios/` folders or `package.json`, treat as major.

## 2. CI does the detection — you don't manually pick

Workflow: `.github/workflows/playstore.yml`. Triggers on push to `main` touching `apps/customer-app/**`. Steps:

1. `ci` job — lint + test gate. Must pass first.
2. `detect-bump` job — reads `HEAD~1..HEAD` diff + commit messages, decides `major` or `minor`:
   - `major` if `apps/customer-app/package.json` changed in the commit.
   - `major` if commit subject matches `^(feat|breaking)(\(.+\))?!?:` (i.e. starts with `feat:` or `BREAKING`).
   - `major` if repo variable `FORCE_MAJOR=true` is set (manual override, rare, ask user before touching).
   - `major` once automatically on first-ever deploy (marker file, irrelevant after bootstrap).
   - otherwise `minor` (OTA).
3. `build-submit-update` job:
   - major path: local `eas build --platform android --profile production`, `eas submit` to Play Store production track, THEN also `eas update --branch production` (so anyone still on the old binary but same `runtimeVersion` gets the JS too).
   - minor path: skips build/submit entirely, just runs `eas update --branch production --message "<commit subject>"`.

**Conclusion: your commit message decides the bump type for JS-only changes.** Use `feat:` prefix only if you actually want to force a Play Store rebuild for a JS-only change (you almost never do). Normal OTA-safe commits: `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `style:`, `perf:` — none of these force major.

## 3. runtimeVersion rule — the OTA safety gate

`apps/customer-app/app.json` → `expo.runtimeVersion` is currently pinned to a fixed string (check current value in the file — do not assume `"1.6.0"` is still current, it changes on major bumps).

- **OTA-only change → do NOT touch `runtimeVersion`.** Expo Updates only serves a JS update to devices whose installed native binary has a matching `runtimeVersion`. Bumping it for a JS-only change orphans every existing installed device from receiving the update until they get a new binary from the store — defeats the purpose of OTA.
- **Native/major change → bump `runtimeVersion`** (and it must ship as a Play Store binary, since old binaries can't run new native code anyway). Also bump `expo.version` (semver, e.g. `1.7.0` → `1.8.0`) and `expo.android.versionCode` (integer, always +1, Play Store requires strictly increasing).

Rule of thumb: `runtimeVersion` and `versionCode`/`version` move together, only on major/native changes. Never bump them for a plain OTA.

## 4. Step-by-step: shipping an OTA (minor) change

1. Make the JS/asset-only change in `apps/customer-app/src/...`. Do not touch `package.json`, `android/`, `ios/`, or `app.json` native config.
2. Do not bump `version`, `versionCode`, or `runtimeVersion`.
3. Run tests + lint locally first: `cd apps/customer-app && npm test && npm run lint`.
4. Commit with a non-`feat:`/non-`BREAKING` prefix, e.g.:
   ```
   fix: dedupe admin bell socket items by id
   ```
5. Push to `main` (or open PR and merge to `main` — workflow only fires on `main` push).
6. CI: lint/test gate → `detect-bump` reads the commit → sees no `package.json` diff, no `feat:`/`BREAKING` prefix → decides `minor` → runs `eas update --branch production --message "<subject>"` only. No Play Store submission, no build wait for review.
7. Installed app instances with matching `runtimeVersion` fetch the update on next launch/foreground per `expo.updates` check policy (checks on launch, per `app.json` → `expo.updates`).

## 5. Step-by-step: shipping a major (native) rebuild

1. Make the native-touching change (new native dep, `app.json` native config, prebuild output, etc.).
2. In `apps/customer-app/app.json`:
   - bump `expo.version` (semver bump, e.g. `1.7.0` → `1.8.0`).
   - bump `expo.android.versionCode` by exactly `+1` from current value.
   - bump `expo.runtimeVersion` to match the new `version` (or any new distinct string — just make sure it changes so old binaries don't try to pull JS built against new native code).
3. If a new native module/plugin was added and `android/`/`ios/` folders exist in the repo, they need `expo prebuild` regenerated and committed too (project uses bare-ish native folders in places — check `apps/customer-app/android` / `ios` state before assuming managed-only workflow).
4. Run `npm test && npm run lint` in `apps/customer-app`.
5. Commit — this time the prefix MUST reflect why it's major, e.g.:
   ```
   feat: add live rider tracking with mapbox native SDK
   ```
   (Or if `package.json` changed at all, prefix doesn't even matter — CI forces major automatically off the `package.json` diff. Still use accurate `feat:`/`fix:` for changelog clarity.)
6. Push to `main`.
7. CI: lint/test gate → `detect-bump` sees `package.json` diff and/or `feat:` prefix → decides `major` → runs full path: `eas build --local` (produces `.aab`) → `eas submit` to Play Store production track → THEN also runs `eas update --branch production` so the JS bundle matching the new `runtimeVersion` is published (new binary users get it as soon as Play Store review clears and they update, and it primes the update branch for that runtime).
8. Play Store review is manual/Google-side — after submit, app enters review queue. Not instant. Don't expect users on it same day.

## 6. Commit message cheat sheet (this is what actually triggers major)

| Prefix | Forces major? |
|---|---|
| `feat:` or `feat(scope):` or `feat!:` | yes |
| `BREAKING` anywhere as subject prefix | yes |
| any commit where `apps/customer-app/package.json` changed | yes (regardless of prefix) |
| `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `style:`, `perf:` | no — OTA/minor |

If you're doing a JS-only bugfix, use `fix:`. If you're only touching tests, use `test:`. Never use `feat:` out of habit for a JS-only change — it forces an unnecessary Play Store rebuild + review wait.

## 7. Manual override (rare, ask first)

Repo variable `FORCE_MAJOR=true` on GitHub Actions forces every push down the major path regardless of diff/commit message. This is an emergency lever (e.g. force a full rebuild after some OTA went out broken and you need a clean binary). Do not set this without explicit user confirmation — it triggers a real Play Store submission.

## 8. Things that will NOT auto-detect correctly — be deliberate

- Adding a JS-only npm package still touches `package.json` → CI always treats as major, even if the package has zero native code. No way around this via commit message; it's a hard package.json-diff check.
- Editing `app.json` outside `version`/`versionCode`/`runtimeVersion` (e.g. permission strings, icon paths) does NOT itself force major in CI's detector — CI only checks `package.json` diff + commit prefix. If you change native-relevant `app.json` fields without a `feat:`/`BREAKING` commit and without touching `package.json`, CI will WRONGLY ship it as an OTA. **You must manually use a `feat:` prefix (or ask for `FORCE_MAJOR`) whenever the change is native-relevant but doesn't touch `package.json`.**
- `runtimeVersion` bump has no automatic enforcement either — CI doesn't check it. If you bump it but the change was actually OTA-safe, you just orphaned all installed devices from further updates until they get a new binary. If you forget to bump it on a real native change, devices may crash trying to run new native code with an old JS bundle mismatch, or vice versa. This is a manual judgment call every time — get it right per section 1.

## 9. Never do

- Never push to `main` directly if the user's standing instruction is "don't auto push to prod, I push myself" — check current conversation instructions before pushing, this doc doesn't override that.
- Never hand-run `eas update` or `eas build` from a dev machine against `production` channel/profile outside CI unless explicitly asked — CI is the source of truth for what's live.
- Never bump `runtimeVersion` speculatively "just in case" — it's a deliberate breaking-compat signal, only move it with an actual native change.
