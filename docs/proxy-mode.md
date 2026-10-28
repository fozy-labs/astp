# Proxy mode

## Purpose

`astp proxy` turns bundles from another manifest into an astp source that an organization can edit and publish. The default output is `./templates`; the result can immediately be consumed with `astp install --source ./templates` or pushed to a private repository.

Proxying copies regular template files so an organization can correct instructions and add assets in its own repository. Remote refs stay refs and are copied as definitions without downloading their skills. Local-path refs are materialized as regular items because their relative sources are valid only beside the upstream manifest. A downstream install fetches a remote ref only when that skill is selected.

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

For each copied regular item, the generated manifest preserves `target`, `targets`, `category`, `optional`, `labels`, and `platforms`, and writes `source` as `<bundle>/<target>`. Refs are handled according to their source kind:

- A remote ref stays a ref and preserves `source`, `target`, `optional`, `labels`, and `platforms` unchanged. Proxy does not download it or create `<bundle>/<ref.target>`.
- A local-path ref is materialized as regular items. Proxy copies the referenced directory to `<bundle>/<ref.target>`, applies the existing regular-file, symlink, and `SKILL.md` checks, and emits one skill item per file with targets under `<ref.target>`. The ref's unit metadata moves to the `SKILL.md` item. This is a local filesystem copy, not a network download.

A local ref such as `./external-skill` therefore never escapes into the generated manifest. Materialization is required even if its source is rewritten: the current downloader accepts local-path refs only for a local manifest, while the generated source must also work after publication as a repository archive or hosted manifest.

The generated manifest uses the newest schema version supported by the running CLI. Existing unrelated top-level fields and bundles are preserved. A managed bundle is regenerated from its upstream metadata and selected units, except for its organization-owned version described below. The complete manifest must pass normal manifest validation before it is written.

An existing bundle with the same name but no proxy lock entry is organization-owned, not an implicit proxy target. Proxy leaves it alone unless that bundle is explicitly named with `--force`; an interactive bundle selection never adopts it silently.

## Proxy lock

`astp.lock` lives beside `manifest.json` and keeps lock schema 1. It records upstream provenance, selection, and the state needed to protect local edits. A bundle gains an optional `refs` map alongside `units`; older readers can ignore this proxy-only field:

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
            },
            "refs": {
                "docs/skills/external-guidance": {
                    "version": "1.2.3",
                    "hash": "…"
                }
            }
        }
    }
}
```

Unlike an agent-install lock, unit, ref, and declined paths include the bundle prefix because they are source paths relative to the output root. `version` is the upstream bundle version used for update detection; it is not the version published in the generated manifest.

Regular-unit hashes cover complete source units, including materialized local-path refs. In particular, a block file contributes its entire content, not only its frontmatter: proxy stores a template, not a rendered consumer selection. Skills retain whole-directory hashes. The lock does not contain block selections or hashes.

The `refs` map contains only preserved remote refs. Each hash covers its canonical generated manifest definition, including its source, target, and unit metadata, and deliberately excludes remote content. This lets proxy detect upstream and local ref-definition changes without downloading the skill. Lock I/O must preserve the optional `refs` field; agent installation never writes it.

The manifest itself is not otherwise locked. Managed entries are generated output, while unrelated organization-owned entries are preserved. This avoids a second state file.

## Synchronization and local edits

Proxy synchronization uses the same ownership rules as agent installation, applied to source paths and ref definitions:

- An unmodified tracked unit or remote ref can be updated, deselected, or removed upstream.
- A locally modified tracked unit or remote-ref definition is kept and reported; its previous lock and manifest entries remain in force. `--force` replaces it with the upstream version.
- A modified unit or ref removed upstream or deselected locally is kept as organization-owned content. Its manifest entries and any copied files remain, but its proxy lock entry is removed so later upstream updates do not reclaim it.
- An unmanaged file, skill, or manifest entry occupying a selected path is foreign and is not overwritten without `--force`.
- New non-optional upstream units and refs follow the normal update selection rules; previously declined units stay declined.

If some units are skipped, manifest generation uses the retained entries for those units and the new entries for successfully synchronized units. The manifest must never advertise regular files that were not actually written or omit a retained unit or ref.

Proxy copies regular-item bytes, including materialized local-path refs, and does not render or merge blocks. Local edits to a skill or file therefore protect that whole source unit until `--force`, regardless of whether it contains `<astp-block>` markup. Remote-ref synchronization compares definitions only and never downloads referenced content.

## Published versions

A proxied bundle is a new, organization-owned publication. Its version starts at the upstream version on the first import but is independent afterwards. Proxy never lowers it or replaces it merely because upstream published a different version.

After an `install`, `update`, or `delete` operation changes a managed bundle, proxy bumps its current manifest version once, using the most significant applied change:

- **Major:** a unit or ref was removed, renamed, retargeted, or changed kind.
- **Minor:** a unit or ref was added.
- **Patch:** unit content, a remote-ref definition, or bundle/unit metadata changed without structural changes.

A change to the upstream version alone does not bump the published version when the effective source is unchanged. Skipped local edits do not cause an automatic bump. As with a hand-authored source, maintainers must bump the manifest version when they edit templates or refs directly; `proxy check` reports those edits so an unpublished change is visible.

Proxy cannot detect remote content changes behind an unchanged remote-ref definition. The existing ref contract applies: shipped refs should be pinned to a commit, and changing the pin requires an upstream bundle-version bump. Downstream installation resolves the preserved ref normally.

## Check, update, and failure behavior

`proxy check` compares lock versions and unit paths with each upstream manifest, scans copied units for local edits, compares remote-ref definition hashes, and checks generated-manifest drift. It writes nothing and does not download remote refs. Its report distinguishes upstream updates, new and removed units, local edits, and organization-owned content left after an upstream removal.

`proxy update` preserves the current selection and published-version policy above. `proxy install <bundle>` adds units or synchronizes one bundle and is also how its upstream is switched. Retry messages always include `--output` when a non-default output was used.

All source, download, path-traversal, symlink, and platform-target validations used for regular sources apply before copying regular items. Remote-ref definitions receive normal manifest and target validation without content download. Local-path refs also receive content checks before they are materialized. Manifest and lock writes are atomic individually. A failure after file writes leaves the lock consistent with the files and definitions actually written, and manifest generation for that bundle uses the same resulting state.

## Implementation boundaries

Add proxy command handlers and core synchronization modules rather than passing a synthetic `InstallTarget` through agent installation. Reuse source resolution and download, unit grouping, hashing, lock I/O, path safety, and selection prompts. Separate remote refs from regular units before calling `downloadBundle`, whose current contract downloads every ref passed to it. Handle local-path refs with a dedicated local materialization step instead of passing them to the remote ref downloader. Do not reuse `resolveTarget` or `syncBundle` unchanged: proxy has source-relative paths, platform-neutral templates, whole-template hashes, ref-definition state, and a manifest to maintain.

The implementation test matrix covers initial import, local and remote sources, remote refs without downloads, local-path ref materialization, all platform overrides, selective units, repeated no-op runs, every version-bump class, local edits with and without `--force`, foreign bundles and units, upstream removals, source switching, delete, check without writes, and downstream installation from the generated source. One end-to-end test must assert that proxying a remote refs-only bundle performs no ref download, then install that ref from the generated source and assert exactly one downstream ref download. Another must proxy a local upstream containing `./external-skill` and successfully install its regular items from local and archive forms of the generated source without access to the original upstream directory.
