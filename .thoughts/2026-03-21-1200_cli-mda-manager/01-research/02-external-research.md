---
title: "External Research: Node.js CLI Ecosystem for MDA Template Management"
date: 2026-03-21
stage: 01-research
role: rdpi-external-researcher
rdpi-version: b0.5
---

# External Research: Node.js CLI Ecosystem for MDA Template Management

## 1. CLI Frameworks

### Comparative Analysis

| Library | Approach | TypeScript | Weekly Downloads | Unpacked Size | Dependencies | Last Publish | Confidence |
|---------|----------|------------|-----------------|---------------|-------------|-------------|------------|
| Commander.js (v14.0.3) | Fluent API, chained methods | Built-in declarations | ~153M | 209 kB | 0 | ~1 month ago | **High** |
| Yargs (v18.0.0) | Builder pattern, chained/object config | Via `@types/yargs` | ~80M | 231 kB | 6 | ~10 months ago | **High** |
| Oclif (v4.22.93) | Class-based, convention-over-configuration | Built-in declarations | ~118K | 282 kB | 24 | ~2 days ago | **High** |
| Citty (v0.2.1) | `defineCommand` object API | Built-in declarations | ~9.2M | 24.4 kB | 0 | ~1 month ago | **High** |

Sources: npm registry pages for each package (fetched 2026-03-21).

### Detailed Findings

#### Commander.js

- **Subcommand model**: `.command('name')` with `.action()` handler or stand-alone executable subcommands. Supports nested subcommands. — **Confidence: High** (official docs + npm README)
- **TypeScript**: Built-in declarations. Additional `@commander-js/extra-typings` package for inferred option/argument types from definitions. — **Confidence: High** (npm README)
- **Learning curve**: Low. Most widely used CLI framework in Node.js ecosystem. Extensive examples in README. — **Confidence: High** (153M weekly downloads is strong adoption signal)
- **Bundle size**: Zero dependencies, 209 kB unpacked. Minimal footprint. — **Confidence: High** (npm facts)
- **Maintenance**: Active. v14.0.3 released ~1 month ago. Requires Node.js v20+. — **Confidence: High** (npm facts)
- **Plugin system**: No built-in plugin mechanism; extensible via stand-alone executables or `addCommand()`. — **Confidence: High** (official docs)
- **Async support**: `.parseAsync()` for async action handlers. — **Confidence: High** (official docs)

#### Yargs

- **Subcommand model**: `.command('name', 'description', builder, handler)` pattern. Supports nested commands via builder function. — **Confidence: High** (official docs)
- **TypeScript**: Types via external `@types/yargs` package. Not built-in — requires separate install. — **Confidence: High** (npm page shows DefinitelyTyped icon)
- **Learning curve**: Medium. More configuration surface than Commander. Very flexible but verbose API. — **Confidence: Medium** (community opinion, consistent across multiple sources)
- **Bundle size**: 231 kB unpacked, 6 dependencies. Heavier than Commander or Citty. — **Confidence: High** (npm facts)
- **Maintenance**: v18.0.0 published ~10 months ago. Less frequent releases than Commander. — **Confidence: High** (npm facts)
- **Additional features**: Built-in bash/zsh completion generation. — **Confidence: High** (official docs)

#### Oclif

- **Subcommand model**: Class-per-command pattern. Each command is a class extending `Command` with `run()` method. File system convention: `src/commands/install.ts` = `mycli install`. — **Confidence: High** (official docs)
- **TypeScript**: Built-in, first-class TypeScript support. Generated projects are TypeScript by default. — **Confidence: High** (official docs + npm page)
- **Learning curve**: High. Full framework with its own scaffolding (`npx oclif generate`), manifest generation, packaging system. Designed for large-scale CLIs (Salesforce CLI, Heroku CLI). — **Confidence: High** (official docs, Salesforce/Heroku engineering blog posts)
- **Bundle size**: 282 kB unpacked, 24 dependencies. Heaviest option. — **Confidence: High** (npm facts)
- **Maintenance**: Very actively maintained (published 2 days ago). Backed by Salesforce. — **Confidence: High** (npm facts)
- **Overkill assessment**: For a simple CLI with 3-4 subcommands (install, update, check), oclif's infrastructure (manifest generation, pack/upload/promote commands, plugin system) is excessive. — **Confidence: Medium** (informed assessment based on feature comparison)

#### Citty (unjs ecosystem)

- **Subcommand model**: `defineCommand` with `subCommands` object. Lazy and async command loading. — **Confidence: High** (official docs)
- **TypeScript**: Built-in, first-class. Written in TypeScript. Part of the unjs ecosystem (Nuxt/Nitro). — **Confidence: High** (npm page, GitHub)
- **Learning curve**: Low. Minimalist API. Uses native `util.parseArgs` (Node.js built-in). — **Confidence: High** (official docs)
- **Bundle size**: 24.4 kB unpacked, zero dependencies. Smallest option by far. — **Confidence: High** (npm facts)
- **Maintenance**: v0.2.1, still pre-1.0. Published ~1 month ago. Active development in unjs ecosystem (pi0 maintainer). — **Confidence: High** (npm facts)
- **Community**: 9.2M weekly downloads (high due to unjs ecosystem usage — nuxi, nitro). Fewer standalone community resources compared to Commander. — **Confidence: High** (npm facts)
- **Limitation**: No built-in prompt integration. Needs external prompt library. — **Confidence: High** (official docs — no mention of prompts)
- **Pre-1.0 risk**: API may change before 1.0. — **Confidence: Medium** (version number implies instability, but unjs ecosystem is generally stable)

---

## 2. Interactive Prompt Libraries

### Comparative Analysis

| Library | TypeScript | Weekly Downloads | Unpacked Size | Dependencies | Last Publish | UX Quality | Confidence |
|---------|------------|-----------------|---------------|-------------|-------------|-----------|------------|
| @inquirer/prompts (v8.3.2) | Built-in | ~9.2M | 23.4 kB | 10 | ~6 days ago | High (many prompt types) | **High** |
| @clack/prompts (v1.1.0) | Built-in | ~3.6M | 244 kB | 2 | ~18 days ago | Very High (beautiful UI) | **High** |
| prompts (v2.4.2, terkelg) | Via `@types/prompts` | ~20.6M | 187 kB | 2 | ~4 years ago | Good (functional) | **High** |

Sources: npm registry pages (fetched 2026-03-21).

### Detailed Findings

#### @inquirer/prompts (v8)

- **Architecture**: Complete rewrite from legacy `inquirer` package. Each prompt is a standalone package, re-exported from `@inquirer/prompts`. — **Confidence: High** (npm README explicitly states rewrite)
- **Prompt types**: input, select, checkbox, confirm, search, password, expand, editor, number, rawlist. — **Confidence: High** (official docs)
- **TypeScript**: Built-in declarations. First-class TypeScript support. — **Confidence: High** (npm page)
- **API style**: Each prompt is an awaitable function: `const answer = await select({...})`. Clean async/await pattern. — **Confidence: High** (official docs)
- **Cancellation**: AbortController/AbortSignal support. Throws `ExitPromptError` on Ctrl+C. — **Confidence: High** (official docs)
- **Composability**: Prompts are independent functions — easy to compose, conditionally chain, and test. — **Confidence: High** (official docs, recipes section)
- **Ecosystem**: Large community prompt plugin ecosystem. i18n support via `@inquirer/i18n`. — **Confidence: High** (official docs)
- **Maintenance**: Last publish 6 days ago. Very actively maintained. — **Confidence: High** (npm facts)
- **No spinners/progress**: Does not include spinners or progress bars. Only handles prompts. — **Confidence: High** (official docs — no mention of spinners)

#### @clack/prompts

- **Architecture**: Opinionated, pre-styled wrapper around `@clack/core`. Focused on beautiful CLI UX. — **Confidence: High** (npm README)
- **Prompt types**: text, confirm, select, multiselect, groupMultiselect, spinner, progress. — **Confidence: High** (official docs)
- **UX features**: `intro`/`outro` for session framing, `spinner()` for async operations, `progress()` for progress bars, `log` utility (info/success/warn/error), `tasks()` for sequential spinners, `stream` for LLM-style output. — **Confidence: High** (official docs)
- **TypeScript**: Built-in declarations. — **Confidence: High** (npm page)
- **API style**: Each prompt is an awaitable function. `group()` utility for chaining prompts with cancellation handling. — **Confidence: High** (official docs)
- **Bundle claim**: "80% smaller than other options" — **Confidence: Low** (marketing claim in README; unpacked size is 244 kB which is larger than @inquirer/prompts at 23.4 kB, though this may refer to bundled size after tree-shaking)
- **Maintenance**: v1.1.0 published 18 days ago. Active development (bombshell-dev org). Provenance-signed builds. — **Confidence: High** (npm facts)
- **Ideal for**: CLIs that want polished, consistent visual experience out of the box. Used by tools like `create-svelte`, `create-astro`. — **Confidence: Medium** (GitHub README mentions usage by Astro, SvelteKit)

#### prompts (terkelg)

- **Architecture**: Single unified library. All prompt types in one package. — **Confidence: High** (npm README)
- **Prompt types**: text, password, invisible, number, confirm, list, toggle, select, multiselect, autocompleteMultiselect, autocomplete, date. — **Confidence: High** (official docs)
- **TypeScript**: Types via `@types/prompts` (external). Not built-in. — **Confidence: High** (npm page shows DefinitelyTyped icon)
- **API style**: Pass prompt config object(s) to single `prompts()` function. Supports dynamic prompts (type can be a function). — **Confidence: High** (official docs)
- **Testing**: Built-in `prompts.inject()` for programmatic answer injection. — **Confidence: High** (official docs)
- **Maintenance concern**: Last publish 4 years ago (v2.4.2). No recent activity. — **Confidence: High** (npm facts)
- **Override feature**: `prompts.override()` to pre-fill answers from CLI args (useful with yargs). — **Confidence: High** (official docs)

---

## 3. Template Distribution Strategies

### Comparative Analysis

| Approach | Tool Examples | Versioning | Offline Support | Update Detection | Complexity | Confidence |
|----------|--------------|------------|----------------|-----------------|-----------|------------|
| Git-based fetching (tarball) | giget, degit | Git tags/branches | Cache support | Compare tags/commits | Low | **High** |
| npm registry | templates as npm packages | Semver via npm | npm cache | `npm outdated` | Low | **High** |
| GitHub API (raw content) | Custom fetch | Commit SHA / tags | Must implement | Compare SHA/tags | Medium | **High** |
| Embedded in CLI package | Bundled in dist | Tied to CLI version | Full offline | CLI version = template version | Lowest | **High** |
| Hybrid: Embedded + remote sync | Custom | Independent versioning | Fallback to embedded | Manifest comparison | Medium-High | **Medium** |

### Detailed Findings by Tool

#### degit (Rich-Harris)

- **Approach**: Downloads tarball of latest commit from GitHub/GitLab/Bitbucket. Caches tarballs in `~/.degit/`. — **Confidence: High** (official docs)
- **Status**: Last publish 5 years ago (v2.8.4). Effectively unmaintained. 165K weekly downloads. — **Confidence: High** (npm facts)
- **Versioning**: Supports `#branch`, `#tag`, `#commitHash` syntax. — **Confidence: High** (official docs)
- **Subdirectory support**: `user/repo/subdirectory` syntax. — **Confidence: High** (official docs)
- **Offline**: Caches tarballs, can use cached version. — **Confidence: High** (official docs)
- **Private repos**: Only via `--mode=git` (shells out to git). Default tarball mode doesn't support private repos. — **Confidence: High** (official docs)
- **Successor**: `tiged` is a maintained fork. `giget` (unjs) is the modern replacement. — **Confidence: High** (giget README mentions degit as predecessor)

#### giget (unjs)

- **Approach**: Zero-dependency. Downloads tarballs from GitHub/GitLab/Bitbucket/Sourcehut. Built-in template registry. — **Confidence: High** (official docs)
- **Status**: v3.1.2, published ~2 months ago. 6M weekly downloads. Active maintenance (pi0/unjs). — **Confidence: High** (npm facts)
- **Versioning**: `provider:user/repo#ref` — supports branches, tags, commit hashes. — **Confidence: High** (official docs)
- **Subdirectory support**: `provider:user/repo/subdir#ref`. — **Confidence: High** (official docs)
- **Offline**: `--offline` flag uses cached version. `--prefer-offline` tries cache first. Disk cache support built-in. — **Confidence: High** (official docs)
- **Registry**: Built-in HTTP registry system. Custom registry support via URL endpoint. Registry returns JSON with `name`, `tar`, `defaultDir`, `url`, `subdir`, `headers`. — **Confidence: High** (official docs)
- **Auth**: `--auth` flag or `GIGET_AUTH` env variable. Supports GitHub fine-grained tokens. — **Confidence: High** (official docs)
- **Programmatic API**: `downloadTemplate(source, options)` — clean API for embedding in another tool. — **Confidence: High** (official docs)
- **Custom providers**: Can define custom `TemplateProvider` functions. — **Confidence: High** (official docs)

#### plop (plopjs)

- **Approach**: "Micro-generator framework". Generators defined in `plopfile.js` using Inquirer prompts + Handlebars templates. — **Confidence: High** (official docs)
- **Status**: v4.0.5, published ~2 months ago. 614K weekly downloads. Active maintenance. — **Confidence: High** (npm facts)
- **Template model**: Local templates in project. Uses Handlebars for templating. Actions: add, addMany, modify, append, custom. — **Confidence: High** (official docs)
- **Relevance to astp**: Plop is for code generation within a project, not for distributing templates across projects. It assumes templates live with the plopfile. Not suited for a CLI-to-user template distribution model. — **Confidence: Medium** (assessment based on feature set)
- **Wrapping pattern**: Plop can be wrapped into a custom CLI (`bin` field + plopfile). This pattern is documented. — **Confidence: High** (official docs, "Wrapping Plop" section)

#### hygen

- **Approach**: Convention-based. Template files live in `_templates/` folder. Folder structure = command structure. EJS templates with frontmatter. — **Confidence: High** (official docs)
- **Status**: v6.2.11, last publish 4 years ago. 136K weekly downloads. Appears unmaintained. — **Confidence: High** (npm facts)
- **Template locality**: Templates are project-local (`_templates/`). Also supports global via `HYGEN_TMPLS` env var or custom wrappers. — **Confidence: High** (official docs)
- **Embeddable**: `runner()` function allows embedding hygen in custom CLIs with custom template paths. — **Confidence: High** (official docs, "Build Your Own" section)
- **Relevance to astp**: Hygen's "template locality" model is interesting — templates live in the project and are version-controlled. However, hygen is for code generation, not file distribution. — **Confidence: Medium** (assessment)

#### copier (Python tool — copier.readthedocs.io)

- **Approach**: Python-based template management tool (not an npm package). Templates are git repos with Jinja2 templates. Supports `copier update` to pull template changes into existing projects. — **Confidence: High** (copier official documentation)
- **Update mechanism**: Stores answers in `.copier-answers.yml`. On `copier update`, re-applies template from source repo, merging user overrides. Uses git diff to detect changes. — **Confidence: Medium** (single source — copier docs)
- **Relevance to astp**: Copier's update model is the closest analog to what astp needs — distributing templates and updating them in-place. Key insight: copier tracks what was templated via a manifest/answers file, enabling re-reapplication of templates with conflict detection. — **Confidence: Medium** (assessment)
- **Not applicable directly**: Python-only. But the approach (manifest-tracked template application with update support) is highly relevant. — **Confidence: High** (established tool, well-documented)

### Distribution Strategy Analysis for astp

| Strategy | Pros | Cons | Fit for astp | Confidence |
|----------|------|------|-------------|------------|
| **Embedded templates (bundled in npm package)** | Simplest. Works offline. Single install = templates + CLI. No network dependency at runtime. | Updating templates requires new CLI release. Bundle size grows with templates. | Partial fit — violates "decoupled updates" requirement. | **High** |
| **Git-based fetch (giget-style)** | Independent template versioning. Templates updated without CLI release. Proven approach (giget, degit). Cache/offline support. | Requires network for initial install. More complex update detection. GitHub API rate limits for unauthenticated requests. | Good fit — decouples template versions from CLI versions. | **High** |
| **GitHub API raw content** | Fine-grained fetching (individual files). No need to download entire repo. Easy to implement. | Rate limits (60/hour unauthenticated, 5000/hour with token). No built-in caching. Must manage file list manually. | Medium fit — works for individual file updates but not for bulk operations. | **High** |
| **Hybrid: Embedded fallback + remote fetch** | Best of both worlds: offline fallback from bundled templates, latest from remote. | Most complex to implement. Two sources of truth. Version synchronization overhead. | Overengineered for initial version. | **Medium** |
| **npm sub-packages** | Leverages npm versioning, caching, and dependency management. `npm outdated` for update detection. | Each template bundle is a separate npm package. Overhead in publishing. Users must run npm install. | Poor fit — too much overhead for markdown files. | **Medium** |

---

## 4. Versioning for Template Bundles

### Established Practices

#### Manifest-based version tracking
- **Pattern**: A `manifest.json` in the template source records version per bundle and per individual item. The CLI writes a local manifest (e.g., `.astp-manifest.json` or similar) into the project recording what was installed and at what version. Update detection compares local manifest vs remote manifest. — **Confidence: Medium** (synthesized from copier's `.copier-answers.yml`, npm's `package-lock.json`, and general patterns)
- **Used by**: copier (`.copier-answers.yml`), npm (`package-lock.json`), plop (no versioning — always regenerates).

#### Git tag-based versioning
- **Pattern**: Templates live in a git repo. Each release is tagged (e.g., `templates-v1.2.0`, `rdpi-v2.0.0`). The CLI fetches from a specific tag. — **Confidence: High** (standard git practice, used by degit/giget)
- **Pros**: Leverages git's built-in versioning. Tags are immutable. Easy to fetch specific versions.
- **Cons**: Single repo with multiple independently versioned bundles requires careful tag naming conventions (e.g., `orchestrate-v1.0.0`, `rdpi-v2.0.0`).
- **Used by**: degit, giget (both support `#tag` syntax).

#### Content hashing (checksum-based)
- **Pattern**: Each template file or bundle gets a content hash (SHA-256). Local install records hashes. Update detection: fetch remote hashes, compare with local. — **Confidence: Medium** (general practice in package managers, not specific to template tools)
- **Pros**: Detects any content change regardless of versioning. No need for semantic versioning of individual files.
- **Cons**: Every change triggers update — no distinction between major/minor/patch. User can't assess impact of update.
- **Used by**: npm (integrity field in package-lock.json), git (object hashes).

#### Semver for template collections
- **Pattern**: Template bundles follow semantic versioning. Major = breaking changes (renamed/removed files, changed directory structure). Minor = new files added. Patch = content fixes. — **Confidence: Medium** (extrapolated from npm semver practices; no specific template tool uses this exactly)
- **Insight**: For MDA files (markdown files read by AI agents), "breaking changes" might mean: file path changed (agents look for specific paths), required frontmatter fields changed, file removed from a bundle.

### Update Detection Approaches

| Method | How it works | Pros | Cons | Confidence |
|--------|-------------|------|------|------------|
| Version comparison (semver) | Compare local manifest version vs remote manifest version | Semantic meaning, easy to communicate | Requires discipline in version bumping | **High** |
| Git commit SHA | Store commit SHA of fetched templates, compare vs HEAD | Precise, no manual version management | No semantic information (is it breaking?) | **High** |
| Content hash (per-file) | SHA-256 of each file, compare local vs remote | Detects any change, granular | No semantic info, every whitespace change = update | **Medium** |
| Last-modified timestamp | HTTP header or git metadata | Simple to implement | Unreliable across git operations (rebases change timestamps) | **Low** |
| GitHub Release API | Check latest release via GitHub API | Combines tags + release notes + assets | Requires GitHub API, rate limits | **Medium** |

---

## 5. npm CLI Packaging Best Practices

### Established Practices

#### `bin` field configuration
- **Pattern**: `"bin": { "astp": "./dist/cli.js" }` or `"bin": "./dist/cli.js"` (when package name = command name). — **Confidence: High** (npm official docs)
- **Shebang**: File referenced in `bin` must start with `#!/usr/bin/env node`. — **Confidence: High** (npm official docs, explicitly stated: "Please make sure that your file(s) referenced in bin starts with `#!/usr/bin/env node`, otherwise the scripts are started without the node executable!")
- **Behavior**: Global install creates symlink (Unix) or `.cmd` file (Windows) in PATH. Local install links to `node_modules/.bin/`. — **Confidence: High** (npm official docs)

#### TypeScript compilation for CLI
- **Pattern**: Source in TypeScript (`src/`), compiled to JavaScript (`dist/`). The `bin` field points to the compiled `.js` file, not `.ts`. — **Confidence: High** (standard practice, Commander docs TypeScript section)
- **Build step**: `tsc` compiles TS to JS. The existing `package.json` already has `"build": "rimraf ./dist && tsc && tsc-alias"`. — **Confidence: High** (observed in project's package.json)
- **`files` field**: Should include `"dist"` to ensure only compiled code is published. — **Confidence: High** (npm official docs)
- **`prepare` script**: Common pattern to add `"prepare": "npm run build"` so building happens before publishing. — **Confidence: High** (npm official docs, devDependencies section)

#### ESM vs CJS considerations
- **Current state (2026)**: ESM is the standard for new Node.js projects. Node.js v20+ has mature ESM support. — **Confidence: High** (multiple sources, Node.js documentation)
- **CLI-specific concern**: The `bin` entry runs via `#!/usr/bin/env node`. ESM modules work fine with this. `"type": "module"` in package.json enables ESM. — **Confidence: High** (Node.js docs)
- **Recommendation in ecosystem**: Most modern CLI frameworks (Commander v14, Citty) work with both ESM and CJS. Commander README shows ESM import examples. — **Confidence: High** (Commander, Citty docs)
- **tsconfig**: For ESM output, use `"module": "node16"` or `"module": "nodenext"` and `"moduleResolution": "node16"` or `"nodenext"`. — **Confidence: High** (TypeScript official docs)

#### `engines` field
- **Pattern**: Specify minimum Node.js version: `"engines": { "node": ">=20" }`. Commander v14 requires Node.js v20+. — **Confidence: High** (npm docs, Commander docs)

#### `files` field
- **Pattern**: Whitelist published files: `"files": ["dist", "README.md"]`. Prevents publishing source code, tests, and development files. — **Confidence: High** (npm official docs)

---

## Opinions and Speculation

- **"Commander is the best CLI framework"**: This is a common opinion in blog posts but oversimplified. Commander is the most popular and battle-tested, but for very small CLIs, Citty's zero-dependency approach may be more appropriate. Neither is objectively "best". — **Low confidence** (opinion synthesis)

- **"@clack/prompts is replacing Inquirer"**: Some blog posts claim this. In reality, @clack/prompts has 3.6M weekly downloads vs @inquirer/prompts at 9.2M. Both are actively maintained. @clack/prompts is preferred when visual polish is priority; @inquirer/prompts when prompt type variety matters. — **Low confidence** (opinion in community posts)

- **"Embed templates in the CLI package for simplicity"**: Several blog posts recommend this for starter CLIs. While simpler, it contradicts astp's explicit requirement that "Updating MDA templates does NOT require a new CLI version." — **Low confidence** (contextually inapplicable opinion)

- **"Use giget for all template fetching"**: The unjs ecosystem increasingly standardizes on giget (used by Nuxt CLI `nuxi`, Nitro). For projects already in the unjs orbit, this is a natural choice. — **Medium confidence** (ecosystem trend, not universal)

---

## Pitfalls

### CLI Framework Pitfalls

1. **Oclif lock-in**: Oclif's class-based command structure, manifest system, and packaging tools create significant coupling. Migrating away from oclif later is expensive. Overkill for small CLIs. — **Confidence: High** (architecture analysis, multiple StackOverflow threads)

2. **Yargs TypeScript ergonomics**: Yargs requires external `@types/yargs`. The types can lag behind releases. Generic type inference for options is complex. — **Confidence: Medium** (DefinitelyTyped issues, community reports)

3. **Citty pre-1.0 breakage**: As a pre-1.0 package in active development, API changes are possible between minor versions. The unjs ecosystem generally maintains stability, but there's no formal guarantee. — **Confidence: Medium** (version number, unjs track record)

### Template Distribution Pitfalls

4. **GitHub API rate limits**: Unauthenticated GitHub API: 60 requests/hour. Authenticated: 5,000/hour. For a CLI that checks for updates, unauthenticated use can easily exhaust rate limits in CI environments. — **Confidence: High** (GitHub official docs)

5. **Tarball-based fetch doesn't support private repos easily**: degit's tarball mode fails on private repos. giget requires explicit auth token. This is important if the template repo is ever made private. — **Confidence: High** (degit docs, giget docs)

6. **Template update conflicts**: When a user modifies an installed template file and then runs update, the update can overwrite their changes. Tools like copier handle this with git-based merging, but most Node.js tools (degit, giget) simply overwrite. — **Confidence: High** (documented behavior in degit/giget — `--force` flag overwrites)

7. **Cache invalidation**: giget and degit cache tarballs locally. If cache is corrupted or stale, users get outdated content. `--no-cache` or `--force` flags exist but users may not know to use them. — **Confidence: Medium** (general caching concern, documented in giget)

### npm Packaging Pitfalls

8. **Missing shebang**: Forgetting `#!/usr/bin/env node` in the CLI entry point causes cryptic errors on Unix systems. Windows `.cmd` wrappers add it automatically, masking the issue during Windows-only development. — **Confidence: High** (npm docs explicitly warn about this)

9. **ESM + `__dirname`**: ESM modules don't have `__dirname`/`__filename`. Must use `import.meta.url` + `fileURLToPath`/`dirname` from `node:url` and `node:path`. Relevant when resolving template paths relative to the CLI package. — **Confidence: High** (Node.js documentation, common migration issue)

10. **`prepare` script runs on `npm install`**: If `"prepare": "npm run build"` is set, it runs for all installs (including consumers installing as dependency). The project must ensure build dependencies are in `dependencies`, not `devDependencies`, or use a conditional build. — **Confidence: High** (npm docs, common footgun)

---

## Performance

No specific benchmarks were found for CLI framework comparison (no credible source provides apples-to-apples startup time or throughput benchmarks for Commander vs Yargs vs Citty). The following are observed characteristics:

- **Citty**: Claims to be "fast and lightweight", uses native `util.parseArgs`. Zero dependencies means faster `require()`/`import` time. — **Confidence: Medium** (claimed by maintainer, reasonable given zero deps)
- **Commander**: Zero dependencies. 14 files. Minimal overhead. Widely reported as "fast enough" for any CLI use case. — **Confidence: Medium** (no benchmarks, but 153M weekly downloads without performance complaints)
- **Oclif**: Heavier startup due to 24 dependencies, manifest loading, and class instantiation. Noticeable cold start on first run, but mitigated by subsequent caching. — **Confidence: Medium** (community reports, architecture analysis)
- **Hygen**: Explicitly tracks startup speed as "first-class citizen" with dedicated benchmark suite. — **Confidence: High** (hygen README, "Start Up Speed Testing" section)

For template distribution:
- **Tarball (giget)**: Fast. Downloads one compressed archive, extracts. No git history overhead. — **Confidence: High** (giget README, degit design rationale)
- **Git clone (--depth 1)**: Slower than tarball. Still downloads `.git` metadata. — **Confidence: High** (degit README explicitly compares)
- **GitHub API (per-file)**: Multiple HTTP requests if many files. Can be slow for bundles with many items (e.g., rdpi bundle has 20+ files). — **Confidence: Medium** (architecture analysis)

---

## Sources

- [npm: commander v14.0.3](https://www.npmjs.com/package/commander) — Package details, README, API documentation
- [npm: yargs v18.0.0](https://www.npmjs.com/package/yargs) — Package details, README
- [npm: oclif v4.22.93](https://www.npmjs.com/package/oclif) — Package details, README
- [npm: citty v0.2.1](https://www.npmjs.com/package/citty) — Package details, README
- [npm: @inquirer/prompts v8.3.2](https://www.npmjs.com/package/@inquirer/prompts) — Package details, README
- [npm: @clack/prompts v1.1.0](https://www.npmjs.com/package/@clack/prompts) — Package details, README
- [npm: prompts v2.4.2](https://www.npmjs.com/package/prompts) — Package details, README
- [npm: degit v2.8.4](https://www.npmjs.com/package/degit) — Package details, README
- [npm: giget v3.1.2](https://www.npmjs.com/package/giget) — Package details, README, programmatic API
- [npm: plop v4.0.5](https://www.npmjs.com/package/plop) — Package details, README, wrapping patterns
- [npm: hygen v6.2.11](https://www.npmjs.com/package/hygen) — Package details, README, embedding pattern
- [npm docs: package.json](https://docs.npmjs.com/cli/v10/configuring-npm/package-json) — Official npm documentation on bin, files, engines, exports fields
- [copier documentation](https://copier.readthedocs.io/) — Python-based template management tool (update mechanism reference)
