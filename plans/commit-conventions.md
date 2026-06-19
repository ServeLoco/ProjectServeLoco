# Commit Conventions for VillKro

This document explains the commit message conventions used in the VillKro repo. Following these conventions is **critical** because the GitHub Actions workflow (`playstore.yml`) uses the commit prefix to decide whether to:

- Do a full Android `.aab` build + upload to Play Store (**MAJOR**), or
- Do a fast OTA update only — no Play Store review (**MINOR**)

## Quick reference table

| Prefix | Meaning | Workflow action |
|---|---|---|
| `feat:` | New user-facing feature | 🔨 **MAJOR** — full build |
| `fix:` | Bug fix | ⚡ **MINOR** — OTA update only |
| `chore:` | Maintenance, deps, config | ⚡ **MINOR** — OTA update only |
| `docs:` | Documentation only | ⚡ **MINOR** — OTA update only |
| `refactor:` | Code cleanup, no behavior change | ⚡ **MINOR** — OTA update only |
| `style:` | Formatting only | ⚡ **MINOR** — OTA update only |
| `test:` | Adding tests | ⚡ **MINOR** — OTA update only |
| `perf:` | Performance improvement | ⚡ **MINOR** — OTA update only |
| `BREAKING:` or `feat!:` | Breaking change | 🔨 **MAJOR** — full build |

## How the workflow decides

```yaml
# Simplified from .github/workflows/playstore.yml (detect-bump step)

BUMP = "minor"  # default

if commit_message starts with "feat:" or "BREAKING:":
    BUMP = "major"        # do full .aab build
if package.json (apps/customer-app) was changed:
    BUMP = "major"        # new packages = native code = need rebuild
```

If BUMP is **major** → full `.aab` build + submit to Play Store (~15 min)
If BUMP is **minor** → just publish EAS Update / OTA (~5 sec)

## Real examples

### 1. Button color change (JS only) — fastest
```bash
git commit -m "fix: make checkout button orange"
git push
```
- ci (lint + test) runs → ~2 min
- detect-bump → "fix:" is not "feat:" → MINOR
- build-submit-update → skips build, skips submit, runs only `eas update`
- **OTA update published in 5 seconds**
- Users open app → get new button color

**Total: ~2 minutes**

### 2. Add a new screen
```bash
git commit -m "feat: add order tracking screen"
git push
```
- ci passes
- detect-bump → "feat:" → MAJOR
- build-submit-update → builds `.aab` (15 min), submits, publishes OTA
- User uploads `.aab` to Play Console manually OR workflow submits automatically

**Total: ~15-20 minutes**

### 3. Update a dependency
```bash
# If JS-only dep (e.g., a new lodash function):
git commit -m "chore: bump zustand to 5.0.1"

# If native dep (adds new native module):
npm install expo-camera
git commit -m "feat: add expo-camera for QR scanning"
```
- First example → MINOR (OTA only)
- Second example → MAJOR (native module needs compilation)

### 4. Bug fix
```bash
git commit -m "fix: crash when cart has 0 items"
```

### 5. Refactor
```bash
git commit -m "refactor: extract product card into reusable component"
```

## ⚠️ One critical gotcha

If you add a **new native package** with `npm install`, you MUST use `feat:` (or include `BREAKING:`), because:

- JS-only changes go through OTA ✓
- New native modules need to be **compiled into the new `.aab`** — OTA cannot do that

**Rule of thumb:** If you ran `npm install <new-package>`, use `feat:`.

## Common mistakes

### ❌ Mistake 1: Using `feat:` for non-features
```bash
# WRONG — this triggers a full build for no reason
git commit -m "feat: update package.json"

# RIGHT — package updates are maintenance
git commit -m "chore: update package.json"
```

### ❌ Mistake 2: Using `fix:` for native changes
```bash
# WRONG — OTA can't deliver new native code
git commit -m "fix: add camera support"

# RIGHT — adding camera is a feature
git commit -m "feat: add camera for QR scanning"
```

### ❌ Mistake 3: Vague commit messages
```bash
# WRONG — workflow can't detect type
git commit -m "updated button"
git commit -m "fix stuff"

# RIGHT
git commit -m "fix: update checkout button color to orange"
```

### ❌ Mistake 4: Forgetting the colon
```bash
# WRONG — "fix " is not a recognized prefix
git commit -m "fix button bug"

# RIGHT — colon is required
git commit -m "fix: button bug"
```

## Cheat sheet card

```
┌──────────────────────────────────────────────────────┐
│ What did I change?          │ Commit prefix         │
├──────────────────────────────────────────────────────┤
│ Button text/color/style     │ fix: or chore:        │
│ Add new screen/feature      │ feat:                  │
│ Fix a crash/bug             │ fix:                   │
│ Update a JS library         │ chore:                 │
│ Add a native library        │ feat: + npm install    │
│ Refactor code (no behavior) │ refactor:              │
│ Update docs                 │ docs:                  │
│ Change settings/config      │ chore:                 │
│ Performance improvement     │ perf:                  │
│ Add tests                   │ test:                  │
│ Breaking API change         │ feat!: or BREAKING:    │
└──────────────────────────────────────────────────────┘
```

## How long does each build type take?

| Change type | Prefix | Time | What happens |
|---|---|---|---|
| JS only (text, colors, logic) | `fix:` / `chore:` / `docs:` / etc. | **~2 minutes** | Lint + test + OTA publish |
| New feature (JS only) | `feat:` | ~2 minutes | Same as above — actually no native code |
| New native package | `feat:` + `npm install` | ~15-20 minutes | Lint + test + full `.aab` build + submit + OTA |
| Native config change | `feat:` (e.g., new permissions) | ~15-20 minutes | Full build needed |

## When in doubt

Ask: **"Did I add any new package or change any native config?"**

- **No** → use `fix:` or `chore:` → fast OTA
- **Yes** → use `feat:` → full build (15-20 min)
