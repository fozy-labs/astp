# Proxy mode

## Purpose

`astp proxy` turns bundles from another manifest into a self-contained astp source that an organization can edit and publish. The default output is `./templates`; the result can immediately be consumed with `astp install --source ./templates` or pushed to a private repository.

Proxying copies templates instead of generating refs. An organization can therefore correct instructions and add assets in its own repository. Upstream refs are downloaded and materialized as regular items too. Refs remain available for hand-authored manifests, but proxy does not emit them.

## Command interface

```bash
astp proxy                         # interactive install wizard
astp proxy install [bundle] [--source <spec>] [--skill <name>]... [--force]
astp proxy update [--force]
astp proxy check
astp proxy delete [bundle] [--skill <name>]... [--force]
```

Every command accepts `--output <dir>`, defaulting to `./templates`, resolved from the current working directory. The wizard and non-interactive selection rules mirror the corresponding agent-install commands, with these differences:

- There is no `--platform` or `--target`: a proxy preserves all platforms and per-platform target overrides.
- There is no `--block`: proxy copies `<astp-block>` templates verbatim, leaving block selection to downstream consumers.
- `--source` selects or switches the upstream of a bundle. Without it, `install` uses the source recorded in the proxy lock, then the default astp source.
- `update` and `check` read every upstream from the proxy lock. `delete` updates both the copied files and the generated manifest.

`astp list --source ./templates` remains the way to inspect the generated source; proxy does not add a second list command.

## Generated source

For an upstream bundle named `docs`, a unit whose canonical target is `skills/markdown-craft` is stored under `docs/skills/markdown-craft`. This is the existing source layout, not an agent-install layout:

```text
templates/
├── manifest.json
├── astp.lock
├── docs/
│   └── skills/
│       └── markdown-craft/
│           ├── SKILL.md
│           └── references/…
└── agreement/
    └── rules/
        └── working-agreement.md
```

For each copied regular item, the generated manifest preserves `target`, `targets`, `category`, `optional`, `labels`, and `platforms`, and writes `source` as `<bundle>/<target>`. For an upstream ref:

1. Download the complete referenced skill and apply the existing regular-file and `SKILL.md` checks.
2. Copy every file to `<bundle>/<ref.target>/<file>`.
3. Generate regular skill items for those files; put the ref's unit metadata on the `SKILL.md` item.
4. Emit no `refs` entry for the materialized skill.

The generated manifest uses the newest schema version supported by the running CLI. Existing unrelated top-level fields and bundles are preserved. A managed bundle is regenerated from its upstream metadata and selected units, except for its organization-owned version described below. The complete manifest must pass normal manifest validation before it is written.

An existing bundle with the same name but no proxy lock entry is organization-owned, not an implicit proxy target. Proxy leaves it alone unless that bundle is explicitly named with `--force`; an interactive bundle selection never adopts it silently.

## Proxy lock

`astp.lock` lives beside `manifest.json` and keeps lock schema 1. It records upstream provenance, selection, and the state needed to protect local edits:

```json
{
    "schemaVersion": 1,
    "bundles": {
        "docs": {
            "source": "gh:fozy-labs/astp",
            "declined": [],
            "units": {
                "docs/skills/markdown-craft": {
                    "kind": "skill",
                    "version": "1.2.3",
                    "hash": "…"
                }
            }
        }
    }
}
```

Unlike an agent-install lock, unit and declined paths include the bundle prefix because they are source paths relative to the output root. `version` is the upstream bundle version used for update detection; it is not the version published in the generated manifest.

Hashes cover complete source units. In particular, a block file contributes its entire content, not only its frontmatter: proxy stores a template, not a rendered consumer selection. Skills retain whole-directory hashes. The lock does not contain block selections or hashes.

The manifest itself is not locked. Managed entries are generated output, while unrelated organization-owned entries are preserved. This keeps the existing lock format and avoids a second state file.

## Synchronization and local edits

Proxy synchronization uses the same ownership rules as agent installation, applied to source paths:

- An unmodified tracked unit can be updated, deselected, or removed upstream.
- A locally modified tracked unit is kept and reported; its previous lock and manifest entries remain in force. `--force` replaces it with the upstream unit.
- A modified unit removed upstream or deselected locally is kept as organization-owned content. Its manifest items remain, but its proxy lock entry is removed so later upstream updates do not reclaim it.
- An unmanaged file or skill occupying a selected path is foreign and is not overwritten without `--force`.
- New non-optional upstream units follow the normal update selection rules; previously declined units stay declined.

If some units are skipped, manifest generation uses the retained entries for those units and the new entries for successfully synchronized units. The manifest must never advertise files that were not actually written or omit a retained unit.

Proxy copies bytes and does not render or merge blocks. Local edits to a skill or file therefore protect that whole source unit until `--force`, regardless of whether it contains `<astp-block>` markup.

## Published versions

A proxied bundle is a new, organization-owned publication. Its version starts at the upstream version on the first import but is independent afterwards. Proxy never lowers it or replaces it merely because upstream published a different version.

After an `install`, `update`, or `delete` operation changes a managed bundle, proxy bumps its current manifest version once, using the most significant applied change:

- **Major:** a unit was removed, renamed, retargeted, or changed between file and skill.
- **Minor:** a unit was added.
- **Patch:** unit content or bundle/item metadata changed without structural changes.

A change to the upstream version alone does not bump the published version when the effective source is unchanged. Skipped local edits do not cause an automatic bump. As with a hand-authored source, maintainers must bump the manifest version when they edit templates directly; `proxy check` reports those edits so an unpublished change is visible.

## Check, update, and failure behavior

`proxy check` compares lock versions and unit paths with each upstream manifest, scans copied units for local edits, and checks generated-manifest drift. It writes nothing. Its report distinguishes upstream updates, new and removed units, local edits, and organization-owned content left after an upstream removal.

`proxy update` preserves the current selection and published-version policy above. `proxy install <bundle>` adds units or synchronizes one bundle and is also how its upstream is switched. Retry messages always include `--output` when a non-default output was used.

All source, download, path-traversal, symlink, and platform-target validations used for regular sources apply before copying. Manifest and lock writes are atomic individually. A failure after file writes leaves the lock consistent with the files actually written, and manifest generation for that bundle uses the same resulting state.

## Implementation boundaries

Add proxy command handlers and core synchronization modules rather than passing a synthetic `InstallTarget` through agent installation. Reuse source resolution and download, unit grouping, hashing, lock I/O, path safety, and selection prompts. Do not reuse `resolveTarget` or `syncBundle` unchanged: proxy has source-relative paths, platform-neutral templates, whole-template hashes, and a manifest to maintain.

The implementation test matrix covers initial import, local and remote sources, upstream refs, all platform overrides, selective units, repeated no-op runs, every version-bump class, local edits with and without `--force`, foreign bundles and units, upstream removals, source switching, delete, check without writes, and a downstream install from the generated source. An end-to-end test must proxy one bundle from a mocked upstream and install it into a real temporary agent root using the generated manifest.
