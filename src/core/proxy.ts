import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
    Bundle,
    BundleRef,
    FileStatus,
    ForeignUnit,
    InstalledBundle,
    InstalledUnit,
    Manifest,
    TemplateItem,
} from "@/types/index.js";

import { downloadBundle, isLocalRefSource } from "./fetcher.js";
import { computeHash } from "./frontmatter.js";
import { validateTargetPath } from "./installer.js";
import type { Lock, LockBundle, LockRef } from "./lock.js";
import { writeLock } from "./lock.js";
import { SUPPORTED_SCHEMA_VERSIONS, validateManifest } from "./manifest.js";
import { assertInsideRoot, nullPrototype } from "./path-safety.js";
import { computeSkillTreeHash, computeTemplateUnitHash } from "./skill-tree.js";
import type { ManifestSource } from "./source.js";
import { removeEmptyDirectories } from "./sync.js";
import type { TemplateUnit } from "./units.js";
import { groupTemplateItems } from "./units.js";
import { loadInstalled } from "./version.js";

export interface ProxyState {
    lock: Lock;
    bundles: InstalledBundle[];
    manifest: Manifest;
    manifestExists: boolean;
}

export interface ProxyDownload {
    tempDir: string;
    units: TemplateUnit[];
    remoteRefs: TemplateUnit[];
}

export interface ProxySyncResult {
    bundle: Bundle;
    installed: FileStatus[];
    removed: FileStatus[];
    skipped: FileStatus[];
    kept: FileStatus[];
    foreign: ForeignUnit[];
}

export interface ProxyDeleteResult {
    bundle?: Bundle;
    removed: FileStatus[];
    kept: FileStatus[];
}

export interface ProxyComparison {
    bundleName: string;
    installedVersion: string;
    availableVersion: string | null;
    newUnits: string[];
    removedUnits: string[];
    modifiedUnits: string[];
    missingUnits: string[];
    driftUnits: string[];
    outOfSync: boolean;
}

export function resolveProxyOutput(output?: string): string {
    return path.resolve(process.cwd(), output ?? "./templates");
}

export async function loadProxyState(rootDir: string): Promise<ProxyState> {
    const [{ lock, bundles }, { manifest, exists }] = await Promise.all([
        loadInstalled(rootDir),
        readProxyManifest(rootDir),
    ]);
    return { lock, bundles, manifest, manifestExists: exists };
}

export async function readProxyManifest(rootDir: string): Promise<{ manifest: Manifest; exists: boolean }> {
    const manifestPath = path.join(rootDir, "manifest.json");
    let text: string;
    try {
        text = await fs.readFile(manifestPath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return { manifest: emptyProxyManifest(), exists: false };
    }
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Invalid manifest JSON at ${manifestPath}`);
    }
    return { manifest: validateManifest(data), exists: true };
}

export async function writeProxyManifest(rootDir: string, manifest: Manifest): Promise<void> {
    const manifestPath = path.join(rootDir, "manifest.json");
    if (Object.keys(manifest.bundles).length === 0) {
        await fs.rm(manifestPath, { force: true });
        return;
    }
    validateManifest(manifest);
    await fs.mkdir(rootDir, { recursive: true });
    const tempPath = path.join(rootDir, `manifest.json.tmp-${randomUUID()}`);
    try {
        await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        await fs.rename(tempPath, manifestPath);
    } finally {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
}

export async function downloadProxyBundle(
    source: ManifestSource,
    bundle: Bundle,
    units: TemplateUnit[] = groupTemplateItems(bundle),
): Promise<ProxyDownload> {
    const remoteRefs = units.filter(isRemoteRef);
    const downloadable = units.filter((unit) => !isRemoteRef(unit));
    const tempDir = await downloadBundle(source, bundle, downloadable);
    return { tempDir, units: downloadable, remoteRefs };
}

export function hashProxyRef(ref: BundleRef): string {
    return computeHash(
        canonical({
            source: ref.source,
            target: ref.target,
            optional: ref.optional,
            labels: ref.labels,
            platforms: ref.platforms,
        }),
    );
}

export async function syncProxyBundle(args: {
    rootDir: string;
    source: string;
    bundle: Bundle;
    tempDir: string;
    units: TemplateUnit[];
    selected: Set<string>;
    force: boolean;
    replaceBundle?: boolean;
    state: ProxyState;
}): Promise<ProxySyncResult> {
    const { rootDir, bundle, state } = args;
    const result: ProxySyncResult = {
        bundle,
        installed: [],
        removed: [],
        skipped: [],
        kept: [],
        foreign: [],
    };
    const installed = state.bundles.find((entry) => entry.bundleName === bundle.name);
    const existingLock = state.lock.bundles[bundle.name];
    const lockBundle: LockBundle = existingLock
        ? {
              source: args.source,
              declined: [...existingLock.declined],
              units: nullPrototype(existingLock.units),
              ...(existingLock.refs ? { refs: nullPrototype(existingLock.refs) } : {}),
          }
        : { source: args.source, declined: [], units: nullPrototype(), refs: nullPrototype() };
    if (Object.keys(lockBundle.refs ?? {}).length === 0) delete lockBundle.refs;

    if (args.replaceBundle) await fs.rm(path.join(rootDir, bundle.name), { recursive: true, force: true });
    const oldBundle = args.replaceBundle ? undefined : state.manifest.bundles[bundle.name];
    const oldUnits = oldBundle ? groupTemplateItems(oldBundle) : [];
    const oldByTarget = new Map(oldUnits.map((unit) => [unit.relativePath, unit]));
    const currentByTarget = new Map(
        (installed?.units ?? []).map((unit) => [stripBundlePrefix(bundle.name, unit.relativePath), unit]),
    );
    const regularUnits = args.units.filter((unit) => !isRemoteRef(unit));
    const remoteRefs = args.units.filter(isRemoteRef);
    const regularByTarget = new Map(regularUnits.map((unit) => [unit.relativePath, unit]));
    const remoteByTarget = new Map(remoteRefs.map((unit) => [unit.relativePath, unit]));
    const declined = new Set(lockBundle.declined);
    const managed = new Set<string>();
    const retained = new Set<string>();
    const skipped = new Set<string>();
    const contentChanged = new Set<string>();

    for (const unit of oldUnits) retained.add(unit.relativePath);

    const keepRegular = (unit: InstalledUnit): void => {
        const target = stripBundlePrefix(bundle.name, unit.relativePath);
        retained.add(target);
        result.kept.push(proxyStatus(unit));
    };
    const removeRegular = async (unit: InstalledUnit, addDecline: boolean): Promise<void> => {
        const target = stripBundlePrefix(bundle.name, unit.relativePath);
        if (unit.state === "modified" && !args.force) {
            delete lockBundle.units[unit.relativePath];
            keepRegular(unit);
            return;
        }
        await removeProxyPath(rootDir, unit.relativePath);
        delete lockBundle.units[unit.relativePath];
        retained.delete(target);
        if (addDecline) declined.add(unit.relativePath);
        result.removed.push(proxyStatus(unit));
    };
    const keepRef = (target: string): void => {
        retained.add(target);
        result.kept.push(proxyTargetStatus(bundle.name, target, "skill", "modified"));
    };
    const removeRef = (target: string, addDecline: boolean): void => {
        const sourcePath = proxyUnitPath(bundle.name, target);
        const oldRef = unitRef(oldByTarget.get(target));
        const locked = lockBundle.refs?.[sourcePath];
        if (locked && oldRef && hashProxyRef(oldRef) !== locked.hash && !args.force) {
            delete lockBundle.refs![sourcePath];
            keepRef(target);
            return;
        }
        if (lockBundle.refs) delete lockBundle.refs[sourcePath];
        retained.delete(target);
        if (addDecline) declined.add(sourcePath);
        result.removed.push(proxyTargetStatus(bundle.name, target, "skill", "unmodified"));
    };

    try {
        for (const current of installed?.units ?? []) {
            const target = stripBundlePrefix(bundle.name, current.relativePath);
            if (!regularByTarget.has(target)) await removeRegular(current, false);
        }
        for (const target of Object.keys(lockBundle.refs ?? {}).map((refPath) =>
            stripBundlePrefix(bundle.name, refPath),
        )) {
            if (!remoteByTarget.has(target)) removeRef(target, false);
        }

        for (const unit of regularUnits) {
            const target = unit.relativePath;
            const sourcePath = proxyUnitPath(bundle.name, target);
            const current = currentByTarget.get(target);
            if (!args.selected.has(target)) {
                if (current) await removeRegular(current, true);
                else declined.add(sourcePath);
                continue;
            }
            declined.delete(sourcePath);
            const lockUnit = lockBundle.units[sourcePath];
            if (retained.has(target) && !lockUnit && oldByTarget.has(target) && !args.force) {
                declined.add(sourcePath);
                result.foreign.push({ targetPath: sourcePath, kind: unit.kind, state: "modified" });
                continue;
            }
            if (current?.state === "modified" && !args.force) {
                skipped.add(target);
                result.skipped.push(proxyStatus(current));
                continue;
            }

            const templateHash = await computeTemplateUnitHash(args.tempDir, unit);
            if (current?.state === "unmodified" && lockUnit?.hash === templateHash) {
                lockUnit.version = bundle.version;
                managed.add(target);
                retained.delete(target);
                continue;
            }
            if (!current) {
                const diskHash = await hashExistingProxyUnit(rootDir, sourcePath, unit.kind);
                if (diskHash !== null) {
                    if (diskHash === templateHash) {
                        lockBundle.units[sourcePath] = {
                            kind: unit.kind,
                            version: bundle.version,
                            hash: templateHash,
                        };
                        managed.add(target);
                        retained.delete(target);
                        result.installed.push(proxyTargetStatus(bundle.name, target, unit.kind, "unmodified"));
                        continue;
                    }
                    if (!args.force) {
                        declined.add(sourcePath);
                        result.foreign.push({
                            targetPath: sourcePath,
                            kind: unit.kind,
                            state: "modified",
                        });
                        continue;
                    }
                }
            }

            const hash = await copyProxyUnit(rootDir, args.tempDir, bundle.name, unit);
            lockBundle.units[sourcePath] = { kind: unit.kind, version: bundle.version, hash };
            managed.add(target);
            retained.delete(target);
            skipped.delete(target);
            contentChanged.add(target);
            result.installed.push(proxyTargetStatus(bundle.name, target, unit.kind, "unmodified"));
        }

        for (const unit of remoteRefs) {
            const target = unit.relativePath;
            const sourcePath = proxyUnitPath(bundle.name, target);
            if (!args.selected.has(target)) {
                if (lockBundle.refs?.[sourcePath]) removeRef(target, true);
                else declined.add(sourcePath);
                continue;
            }
            declined.delete(sourcePath);
            const locked = lockBundle.refs?.[sourcePath];
            if (retained.has(target) && !locked && oldByTarget.has(target) && !args.force) {
                declined.add(sourcePath);
                result.foreign.push({ targetPath: sourcePath, kind: "skill", state: "modified" });
                continue;
            }
            const oldRef = unitRef(oldByTarget.get(target));
            if (locked && oldRef && hashProxyRef(oldRef) !== locked.hash && !args.force) {
                skipped.add(target);
                result.skipped.push(proxyTargetStatus(bundle.name, target, "skill", "modified"));
                continue;
            }
            const next: LockRef = { version: bundle.version, hash: hashProxyRef(unitRef(unit)!) };
            lockBundle.refs ??= nullPrototype();
            lockBundle.refs[sourcePath] = next;
            managed.add(target);
            retained.delete(target);
            skipped.delete(target);
            if (!locked || locked.hash !== next.hash) {
                result.installed.push(proxyTargetStatus(bundle.name, target, "skill", "unmodified"));
            }
        }
    } finally {
        result.bundle = buildProxyBundle({
            upstream: bundle,
            oldBundle,
            oldUnits,
            regularUnits,
            remoteRefs,
            managed,
            retained,
            skipped,
            contentChanged,
        });
        const upstreamPaths = new Set(args.units.map((unit) => proxyUnitPath(bundle.name, unit.relativePath)));
        lockBundle.declined = [...declined]
            .filter((unitPath) => upstreamPaths.has(unitPath))
            .filter((unitPath) => !managed.has(stripBundlePrefix(bundle.name, unitPath)))
            .sort();
        if (lockBundle.refs && Object.keys(lockBundle.refs).length === 0) delete lockBundle.refs;
        if (
            Object.keys(lockBundle.units).length === 0 &&
            Object.keys(lockBundle.refs ?? {}).length === 0 &&
            lockBundle.declined.length === 0
        ) {
            delete state.lock.bundles[bundle.name];
        } else {
            state.lock.bundles[bundle.name] = lockBundle;
        }
        await writeLock(rootDir, state.lock);
        const nextManifest = {
            ...state.manifest,
            schemaVersion: latestProxySchemaVersion(),
            bundles: { ...state.manifest.bundles, [bundle.name]: result.bundle },
        };
        await writeProxyManifest(rootDir, nextManifest);
        state.manifest = nextManifest;
    }

    return result;
}

export async function deleteProxyUnits(args: {
    rootDir: string;
    bundleName: string;
    targets?: Set<string>;
    force: boolean;
    state: ProxyState;
}): Promise<ProxyDeleteResult> {
    const { rootDir, bundleName, state } = args;
    const oldBundle = state.manifest.bundles[bundleName];
    const lockBundle = state.lock.bundles[bundleName];
    if (!oldBundle || !lockBundle) {
        throw new Error(`Proxied bundle '${bundleName}' not found in ${rootDir}`);
    }
    const result: ProxyDeleteResult = { removed: [], kept: [] };
    const oldUnits = groupTemplateItems(oldBundle);
    const currentByTarget = new Map(
        (state.bundles.find((entry) => entry.bundleName === bundleName)?.units ?? []).map((unit) => [
            stripBundlePrefix(bundleName, unit.relativePath),
            unit,
        ]),
    );
    const removed = new Set<string>();
    const whole = args.targets === undefined;

    for (const unit of oldUnits) {
        const sourcePath = proxyUnitPath(bundleName, unit.relativePath);
        const managed = sourcePath in lockBundle.units || sourcePath in (lockBundle.refs ?? {});
        if (!managed || (!whole && !args.targets!.has(unit.relativePath))) continue;
        if (unitRef(unit)) {
            const locked = lockBundle.refs?.[sourcePath];
            if (locked && hashProxyRef(unitRef(unit)!) !== locked.hash && !args.force) {
                result.kept.push(proxyTargetStatus(bundleName, unit.relativePath, "skill", "modified"));
                continue;
            }
            if (lockBundle.refs) delete lockBundle.refs[sourcePath];
        } else {
            const current = currentByTarget.get(unit.relativePath);
            if (current?.state === "modified" && !args.force) {
                result.kept.push(proxyStatus(current));
                continue;
            }
            await removeProxyPath(rootDir, sourcePath);
            delete lockBundle.units[sourcePath];
        }
        removed.add(unit.relativePath);
        if (!whole) lockBundle.declined.push(sourcePath);
        result.removed.push(proxyTargetStatus(bundleName, unit.relativePath, unit.kind, "unmodified"));
    }

    const remaining = oldUnits.filter((unit) => !removed.has(unit.relativePath));
    if (remaining.length === 0) {
        const nextManifest = {
            ...state.manifest,
            schemaVersion: latestProxySchemaVersion(),
            bundles: { ...state.manifest.bundles },
        };
        delete nextManifest.bundles[bundleName];
        state.manifest = nextManifest;
    } else {
        const nextBundle = bundleFromUnits(oldBundle, remaining);
        nextBundle.version = removed.size > 0 ? bumpProxyVersion(oldBundle.version, "major") : oldBundle.version;
        result.bundle = nextBundle;
        state.manifest = {
            ...state.manifest,
            schemaVersion: latestProxySchemaVersion(),
            bundles: { ...state.manifest.bundles, [bundleName]: nextBundle },
        };
    }

    if (whole) {
        delete state.lock.bundles[bundleName];
    } else {
        lockBundle.declined = [...new Set(lockBundle.declined)].sort();
        if (lockBundle.refs && Object.keys(lockBundle.refs).length === 0) delete lockBundle.refs;
        if (
            Object.keys(lockBundle.units).length === 0 &&
            Object.keys(lockBundle.refs ?? {}).length === 0 &&
            lockBundle.declined.length === 0
        ) {
            delete state.lock.bundles[bundleName];
        }
    }
    await writeLock(rootDir, state.lock);
    await writeProxyManifest(rootDir, state.manifest);
    return result;
}

export function compareProxyBundle(args: {
    bundleName: string;
    upstream?: Bundle;
    lockBundle?: LockBundle;
    manifestBundle?: Bundle;
    installed?: InstalledBundle;
}): ProxyComparison {
    const { bundleName, upstream, lockBundle, manifestBundle, installed } = args;
    const upstreamUnits = upstream ? groupTemplateItems(upstream) : [];
    const upstreamByPath = new Map(
        upstreamUnits.map((unit) => [`${unit.kind}\0${proxyUnitPath(bundleName, unit.relativePath)}`, unit]),
    );
    const declined = new Set(lockBundle?.declined ?? []);
    const newUnits = upstreamUnits
        .filter((unit) => {
            const sourcePath = proxyUnitPath(bundleName, unit.relativePath);
            return (
                !(sourcePath in (lockBundle?.units ?? {})) &&
                !(sourcePath in (lockBundle?.refs ?? {})) &&
                !declined.has(sourcePath)
            );
        })
        .map((unit) => unit.relativePath);
    const removedUnits = (installed?.units ?? [])
        .filter((unit) => !upstreamByPath.has(`${unit.kind}\0${unit.relativePath}`))
        .map((unit) => unit.relativePath);
    for (const refPath of Object.keys(lockBundle?.refs ?? {})) {
        if (!upstreamByPath.has(`skill\0${refPath}`)) removedUnits.push(refPath);
    }
    const modifiedUnits = (installed?.units ?? [])
        .filter((unit) => unit.state === "modified")
        .map((unit) => unit.relativePath);
    const missingUnits = (installed?.units ?? [])
        .filter((unit) => unit.state === "missing")
        .map((unit) => unit.relativePath);
    const manifestRefTargets = new Set((manifestBundle?.refs ?? []).map((ref) => ref.target));
    for (const refPath of Object.keys(lockBundle?.refs ?? {})) {
        const target = stripBundlePrefix(bundleName, refPath);
        if (upstreamByPath.has(`skill\0${refPath}`) && !manifestRefTargets.has(target)) missingUnits.push(refPath);
    }
    if (manifestBundle) {
        for (const unit of groupTemplateItems(manifestBundle)) {
            if (!unitRef(unit)) continue;
            const sourcePath = proxyUnitPath(bundleName, unit.relativePath);
            const locked = lockBundle?.refs?.[sourcePath];
            if (locked && locked.hash !== hashProxyRef(unitRef(unit)!)) modifiedUnits.push(sourcePath);
        }
    }
    const driftUnits = upstream && manifestBundle ? proxyMetadataDrift(upstream, manifestBundle, lockBundle) : [];
    const installedVersion = installed?.version || Object.values(lockBundle?.refs ?? {})[0]?.version || "";
    const availableVersion = upstream?.version ?? null;
    const outOfSync =
        !upstream ||
        newUnits.length > 0 ||
        removedUnits.length > 0 ||
        missingUnits.length > 0 ||
        driftUnits.length > 0 ||
        compareVersions(installedVersion, upstream.version) < 0;
    return {
        bundleName,
        installedVersion,
        availableVersion,
        newUnits,
        removedUnits: [...new Set(removedUnits)].sort(),
        modifiedUnits: [...new Set(modifiedUnits)].sort(),
        missingUnits: [...new Set(missingUnits)].sort(),
        driftUnits,
        outOfSync,
    };
}

function proxyMetadataDrift(upstream: Bundle, current: Bundle, lockBundle?: LockBundle): string[] {
    const drift = new Set<string>();
    const fields = ["name", "description", "use-when", "default", "platforms"] as const;
    if (fields.some((field) => canonical(upstream[field]) !== canonical(current[field]))) drift.add(upstream.name);
    const currentItems = new Map(current.items.map((item) => [item.target, item]));
    for (const unit of groupTemplateItems(upstream)) {
        const sourcePath = proxyUnitPath(upstream.name, unit.relativePath);
        if (!(sourcePath in (lockBundle?.units ?? {}))) continue;
        const ref = unitRef(unit);
        if (ref) {
            const target = `${unit.relativePath}/SKILL.md`;
            const expected: TemplateItem = {
                source: `${upstream.name}/${target}`,
                target,
                category: "skill",
                ...(unit.optional !== undefined ? { optional: unit.optional } : {}),
                ...(unit.labels !== undefined ? { labels: unit.labels } : {}),
                ...(unit.platforms !== undefined ? { platforms: unit.platforms } : {}),
            };
            if (canonical(currentItems.get(target)) !== canonical(expected)) drift.add(sourcePath);
            continue;
        }
        for (const expected of proxyItems(upstream.name, unit)) {
            if (canonical(currentItems.get(expected.target)) !== canonical(expected)) drift.add(sourcePath);
        }
    }
    return [...drift].sort();
}

export function isRemoteRef(unit: TemplateUnit): boolean {
    const ref = unitRef(unit);
    return Boolean(ref && !isLocalRefSource(ref.source));
}

function unitRef(unit: TemplateUnit | undefined): BundleRef | undefined {
    return unit?.kind === "skill" ? unit.ref : undefined;
}

export function proxyUnitPath(bundleName: string, target: string): string {
    return `${bundleName}/${target}`;
}

export function stripBundlePrefix(bundleName: string, sourcePath: string): string {
    return sourcePath.startsWith(`${bundleName}/`) ? sourcePath.slice(bundleName.length + 1) : sourcePath;
}

function emptyProxyManifest(): Manifest {
    return { schemaVersion: latestProxySchemaVersion(), bundles: nullPrototype() };
}

function latestProxySchemaVersion(): string {
    const [major, minor] = Object.entries(SUPPORTED_SCHEMA_VERSIONS)
        .map(([version, maxMinor]) => [Number(version), maxMinor] as const)
        .sort(([a], [b]) => b - a)[0]!;
    return `${major}.${minor}`;
}

function buildProxyBundle(args: {
    upstream: Bundle;
    oldBundle?: Bundle;
    oldUnits: TemplateUnit[];
    regularUnits: TemplateUnit[];
    remoteRefs: TemplateUnit[];
    managed: Set<string>;
    retained: Set<string>;
    skipped: Set<string>;
    contentChanged: Set<string>;
}): Bundle {
    const items: TemplateItem[] = [];
    const refs: BundleRef[] = [];
    for (const unit of args.oldUnits) {
        if (unitRef(unit) && (args.retained.has(unit.relativePath) || args.skipped.has(unit.relativePath))) {
            refs.push(unitRef(unit)!);
        } else if (args.retained.has(unit.relativePath) || args.skipped.has(unit.relativePath)) {
            items.push(...(unit.kind === "skill" ? unit.items : [unit.item]));
        }
    }
    for (const unit of args.regularUnits) {
        if (args.managed.has(unit.relativePath)) items.push(...proxyItems(args.upstream.name, unit));
    }
    for (const unit of args.remoteRefs) {
        if (args.managed.has(unit.relativePath)) refs.push(unitRef(unit)!);
    }
    items.sort((a, b) => a.target.localeCompare(b.target));
    refs.sort((a, b) => a.target.localeCompare(b.target));
    const next: Bundle = {
        ...args.upstream,
        version: args.oldBundle?.version ?? args.upstream.version,
        items,
        refs,
    };
    if (refs.length === 0) delete next.refs;
    if (!args.oldBundle) return next;

    const severity = proxyChangeSeverity(args.oldBundle, next, args.contentChanged);
    next.version = severity ? bumpProxyVersion(args.oldBundle.version, severity) : args.oldBundle.version;
    return next;
}

function proxyItems(bundleName: string, unit: TemplateUnit): TemplateItem[] {
    return (unit.kind === "skill" ? unit.items : [unit.item]).map((item) => {
        const isLocalRefRoot = Boolean(unitRef(unit) && item.target === `${unit.relativePath}/SKILL.md`);
        return {
            ...item,
            source: `${bundleName}/${item.target}`,
            ...(isLocalRefRoot
                ? {
                      ...(unit.optional !== undefined ? { optional: unit.optional } : {}),
                      ...(unit.labels !== undefined ? { labels: unit.labels } : {}),
                      ...(unit.platforms !== undefined ? { platforms: unit.platforms } : {}),
                  }
                : {}),
        };
    });
}

function bundleFromUnits(bundle: Bundle, units: TemplateUnit[]): Bundle {
    const next: Bundle = {
        ...bundle,
        items: units.flatMap((unit) =>
            unit.kind === "skill" && !unitRef(unit) ? unit.items : unit.kind === "file" ? [unit.item] : [],
        ),
        refs: units.filter((unit) => unitRef(unit)).map((unit) => unitRef(unit)!),
    };
    if (next.refs?.length === 0) delete next.refs;
    return next;
}

function proxyChangeSeverity(
    oldBundle: Bundle,
    nextBundle: Bundle,
    contentChanged: Set<string>,
): "major" | "minor" | "patch" | null {
    const oldUnits = groupTemplateItems(oldBundle);
    const nextUnits = groupTemplateItems(nextBundle);
    const oldByPath = new Map(oldUnits.map((unit) => [unit.relativePath, unit.kind]));
    const nextByPath = new Map(nextUnits.map((unit) => [unit.relativePath, unit.kind]));
    let severity: "major" | "minor" | "patch" | null = null;
    for (const [unitPath, kind] of oldByPath) {
        if (nextByPath.get(unitPath) !== kind) severity = "major";
    }
    for (const unitPath of nextByPath.keys()) {
        if (!oldByPath.has(unitPath) && severity !== "major") severity = "minor";
    }
    const oldComparable = canonical({ ...oldBundle, version: "" });
    const nextComparable = canonical({ ...nextBundle, version: "" });
    if (severity === null && oldComparable !== nextComparable) severity = "patch";
    if (
        severity === null &&
        [...contentChanged].some((unitPath) => oldByPath.has(unitPath) && nextByPath.has(unitPath))
    ) {
        severity = "patch";
    }
    return severity;
}

function bumpProxyVersion(version: string, severity: "major" | "minor" | "patch"): string {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) throw new Error(`Proxied bundle version '${version}' must be major.minor.patch before updating it`);
    let [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
    if (severity === "major") {
        major += 1;
        minor = 0;
        patch = 0;
    } else if (severity === "minor") {
        minor += 1;
        patch = 0;
    } else {
        patch += 1;
    }
    return `${major}.${minor}.${patch}`;
}

async function copyProxyUnit(
    rootDir: string,
    tempDir: string,
    bundleName: string,
    unit: TemplateUnit,
): Promise<string> {
    const sourcePath = proxyUnitPath(bundleName, unit.relativePath);
    validateTargetPath(rootDir, sourcePath);
    await assertInsideRoot(rootDir, sourcePath);
    if (unit.kind === "file") {
        const targetFile = path.join(rootDir, sourcePath);
        const stagingFile = path.join(rootDir, `.astp-proxy-tmp-${randomUUID()}`);
        let stagingCreated = false;
        try {
            await fs.mkdir(path.dirname(targetFile), { recursive: true });
            await fs.copyFile(path.join(tempDir, unit.item.target), stagingFile);
            stagingCreated = true;
            const hash = await computeTemplateUnitHash(tempDir, unit);
            await assertInsideRoot(rootDir, sourcePath);
            await fs.rm(targetFile, { recursive: true, force: true });
            await fs.rename(stagingFile, targetFile);
            stagingCreated = false;
            return hash;
        } finally {
            if (stagingCreated) await fs.rm(stagingFile, { force: true }).catch(() => undefined);
        }
    }

    const skillDir = path.join(rootDir, sourcePath);
    const stagingDir = path.join(rootDir, `.astp-proxy-tmp-${randomUUID()}`);
    let stagingCreated = false;
    try {
        await fs.mkdir(path.dirname(skillDir), { recursive: true });
        await fs.mkdir(stagingDir);
        stagingCreated = true;
        for (const item of unit.items) {
            validateTargetPath(rootDir, proxyUnitPath(bundleName, item.target));
            const targetFile = path.join(stagingDir, path.posix.relative(unit.relativePath, item.target));
            await fs.mkdir(path.dirname(targetFile), { recursive: true });
            await fs.copyFile(path.join(tempDir, item.target), targetFile);
        }
        const hash = await computeSkillTreeHash(stagingDir);
        await assertInsideRoot(rootDir, sourcePath);
        await fs.rm(skillDir, { recursive: true, force: true });
        await fs.rename(stagingDir, skillDir);
        stagingCreated = false;
        return hash;
    } finally {
        if (stagingCreated) await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function hashExistingProxyUnit(
    rootDir: string,
    sourcePath: string,
    kind: "file" | "skill",
): Promise<string | null> {
    const unitPath = path.join(rootDir, sourcePath);
    try {
        const stat = await fs.lstat(unitPath);
        if (kind === "file" && stat.isFile()) return computeHash(await fs.readFile(unitPath, "utf8"));
        if (kind === "skill" && stat.isDirectory()) return await computeSkillTreeHash(unitPath);
        return "modified";
    } catch (error) {
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
        throw error;
    }
}

async function removeProxyPath(rootDir: string, sourcePath: string): Promise<void> {
    const unitPath = path.join(rootDir, sourcePath);
    await assertInsideRoot(rootDir, sourcePath);
    await fs.rm(unitPath, { recursive: true, force: true });
    await removeEmptyDirectories(path.dirname(unitPath), rootDir);
}

function proxyStatus(unit: InstalledUnit): FileStatus {
    return { targetPath: unit.relativePath, kind: unit.kind, state: unit.state };
}

function proxyTargetStatus(
    bundleName: string,
    target: string,
    kind: "file" | "skill",
    state: FileStatus["state"],
): FileStatus {
    return { targetPath: proxyUnitPath(bundleName, target), kind, state };
}

function compareVersions(a: string, b: string): number {
    const parse = (value: string): number[] | null => {
        const parts = value.split(".").map(Number);
        return parts.some(Number.isNaN) ? null : parts;
    };
    const left = parse(a);
    const right = parse(b);
    if (!left) return -1;
    if (!right) return 0;
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference !== 0) return difference < 0 ? -1 : 1;
    }
    return 0;
}

function canonical(value: unknown): string {
    return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortValue);
    if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, entry]) => entry !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entry]) => [key, sortValue(entry)]),
        );
    }
    return value;
}
