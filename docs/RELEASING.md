# Releasing astp

astp has two independent release targets:

- **Templates** reach users when their change merges to `main`; no npm release or Git tag is needed.
- **The CLI** is an npm package release with a versioned changelog, an annotated tag and a GitHub Release.

`develop` is the default working branch. `main` is protected: changes require a PR, a successful `checks` status and a squash merge. Never push directly to `main`.

## Templates

1. Bump every changed bundle in `templates/manifest.json`: a new file is a minor version, a content or metadata change is a patch, and a removal or rename is major.
2. Run `npm run generate:skills`, then `npm run check:all`.
3. Bring the intended `develop` changes to `main` through a PR and wait for `checks` before squash-merging it. The merge publishes the templates.

## CLI

Choose the semver version from the consumer-visible changes under `## [Unreleased]` in `docs/CHANGELOG.md`. Use `X.Y.Z` below without the `v` prefix; tags and release titles add it.

### Prepare

1. Confirm that `main` contains every change intended for this release. Create `release/vX.Y.Z` from an up-to-date `origin/main`.
2. Run `npm version X.Y.Z --no-git-tag-version` to update `package.json` and `package-lock.json`.
3. Close the changelog's `Unreleased` section as `## [X.Y.Z] - YYYY-MM-DD`, add its compare link and retarget the `Unreleased` link from `vX.Y.Z`. If this release also changes templates, update their bundle versions and regenerate the marketplace as above.
4. Run `npm ci`, `npm run check:all`, `npm run build` and `npm pack --dry-run`. Inspect the package contents and fix any failure before opening the release PR.
5. Commit the release files as `chore(release): vX.Y.Z`, push the branch and open a PR to `main` with the same title. Wait for `checks` and review, then squash-merge it.

Preparation ends here. Do not create a tag, GitHub Release or npm version without an explicit command to publish.

### Publish

1. Fetch the merged `main` and identify the release PR's squash-merge commit. Confirm that its `package.json` has the requested version and that the tag, GitHub Release and npm version do not already exist.
2. Create an annotated tag on that exact commit and push only the tag:

   ```bash
   git tag -a vX.Y.Z <merge-commit> -m vX.Y.Z
   git push origin vX.Y.Z
   ```

3. Extract the `X.Y.Z` changelog section without its heading into a notes file, then create the GitHub Release:

   ```bash
   gh-bot release create vX.Y.Z --repo fozy-labs/astp --verify-tag --title vX.Y.Z --notes-file <notes-file>
   ```

4. From the tagged commit, run `npm ci`, `npm run check:all`, `npm run build` and `npm publish`.
5. Verify every public artifact:

   ```bash
   npm view @fozy-labs/astp@X.Y.Z version
   gh-bot release view vX.Y.Z --repo fozy-labs/astp
   git ls-remote --tags origin vX.Y.Z
   ```

   Bring the release commit into `develop` through the repository's normal PR flow if it is not already there.

If publication stops partway, verify which artifacts exist and resume only the missing steps. Never move a pushed tag, recreate an existing GitHub Release or attempt to overwrite an npm version.
