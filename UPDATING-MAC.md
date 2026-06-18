# Updating the app on macOS

How to pull in newer code without losing your saved work.

## ⚠️ Protect your data first

Your saved work is **not** part of the code download — it lives in two
folders inside the app folder and is intentionally excluded from the repo:

- `data/clients/` — your saved client engagement files (`.xlsx`)
- `reports/`      — generated Excel / PDF / HTML reports

**Whatever update method you use, never delete the old folder before copying
these two folders into the new one.** If you replace files in place (Option B
or C below), they're untouched automatically.

Also: **stop the app before updating** (press `Ctrl+C` in the launcher Terminal
window), and after relaunching, **hard-refresh the browser** with
`Cmd+Shift+R` so it picks up new JavaScript/CSS instead of cached copies.

---

## Option A — Re-download the ZIP (no tools needed)

Use this if you originally downloaded the code as a ZIP.

1. On GitHub, download the repository ZIP again and unzip it. The new ZIP
   already contains the latest code.
2. From your **old** app folder, copy these into the **new** unzipped folder:
   - `data/clients/`
   - `reports/`
3. Use the new folder from now on. Launch it, then hard-refresh the browser.

Simple, but you repeat it on every update.

## Option B — Replace only the changed files

Good when only a file or two changed.

1. On github.com, open each changed file → **Download raw file**.
2. Drop the downloaded file into the same location in your existing app folder,
   replacing the old one.
3. Your `data/clients/` and `reports/` are never touched. Relaunch and
   hard-refresh.

## Option C — Switch to a Git clone (recommended, one-time setup)

After this, every future update is a single `git pull`.

```bash
# install tools if you don't have them (Homebrew):
brew install git gh

# sign in to GitHub (the repo is private):
gh auth login

# clone the repo:
gh repo clone anthonyjohnsonga/m365-policy-playbook
```

Then **once**, copy your `data/clients/` and `reports/` folders from your old
ZIP folder into the freshly cloned folder.

From then on, to update:

```bash
cd m365-policy-playbook
git pull
```

`git pull` only updates code — it will not touch `data/clients/` or `reports/`,
because those are git-ignored. Relaunch and hard-refresh after pulling.

---

## Quick reference

| You have…                    | Do this                                   |
|------------------------------|-------------------------------------------|
| A ZIP download               | Option A (or switch to C)                 |
| A ZIP, tiny change only      | Option B                                  |
| A Git clone                  | `git pull`                                |

Whichever path: stop the app → update → copy/keep `data/clients` + `reports`
→ relaunch → `Cmd+Shift+R`.
