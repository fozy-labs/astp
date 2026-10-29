import {
    checkManifestVersion,
    closeSource,
    DEFAULT_SOURCE,
    fetchManifest,
    formatSource,
    resolveSource,
    resolveSourceRevision,
} from "@/core/index.js";
import type { Lock, LockBundle, ManifestSource, RevisionOptions } from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type { InstalledBundle, InstallTarget, Manifest, UpdateReport } from "@/types/index.js";
import { warnNewerManifest } from "@/ui/prompts.js";

export interface OpenedSource {
    source: ManifestSource;
    /** String recorded in `astp.lock`. */
    spec: string;
    resolvedCommit?: string;
    /** Whether refs should reuse revisions from the same lock entry. */
    useLockedRevisions: boolean;
    manifest: Manifest;
}

export interface OpenOptions {
    lockedCommit?: string;
    lockedSpec?: string;
    requireLocked?: boolean;
}

/** Opens each source revision once per command; `close` removes their downloads. */
export class Sources {
    private readonly opened = new Map<string, OpenedSource>();
    private readonly failed = new Map<string, unknown>();
    private readonly sources: ManifestSource[] = [];
    private readonly warned = new Set<string>();

    constructor(private readonly target: InstallTarget) {}

    /** `--source` values resolve against the cwd, lock values against the lock's directory. */
    async open(spec: string, from: "cli" | "lock", options: OpenOptions = {}): Promise<OpenedSource> {
        const failKey = `${from}\0${spec}\0${options.lockedSpec ?? ""}\0${options.lockedCommit ?? ""}\0${options.requireLocked ?? false}`;
        if (this.failed.has(failKey)) throw this.failed.get(failKey);
        try {
            const parsed = await resolveSource(spec, from === "cli" ? process.cwd() : this.target.rootDir);
            const storedSpec = formatSource(parsed, this.target);
            const useLockedRevisions = options.lockedSpec === storedSpec;
            const resolved = await resolveSourceRevision(parsed, {
                lockedCommit: useLockedRevisions ? options.lockedCommit : undefined,
                requireLocked: options.requireLocked,
            });
            const source = resolved.source;
            const key = `${storedSpec}\0${resolved.resolvedCommit ?? ""}\0${useLockedRevisions}`;
            const existing = this.opened.get(key);
            if (existing) return existing;
            this.sources.push(source);
            const opened = {
                source,
                spec: storedSpec,
                resolvedCommit: resolved.resolvedCommit,
                useLockedRevisions,
                manifest: await fetchManifest(source),
            };
            this.opened.set(key, opened);
            return opened;
        } catch (error) {
            this.failed.set(failKey, error);
            throw error;
        }
    }

    /** Each installed bundle's lock source (legacy units: the default), with the bundle's name in errors. */
    async openInstalled(
        bundles: InstalledBundle[],
        lock: Lock,
        options: { locked?: boolean } = {},
    ): Promise<Map<string, OpenedSource>> {
        const byRevision = new Map<string, { spec: string; lockedCommit?: string; bundles: InstalledBundle[] }>();
        for (const bundle of bundles) {
            const lockBundle = lock.bundles[bundle.bundleName];
            const spec = lockBundle?.source ?? DEFAULT_SOURCE;
            const lockedCommit = options.locked ? lockBundle?.resolvedCommit : undefined;
            const key = `${spec}\0${lockedCommit ?? ""}`;
            const group = byRevision.get(key) ?? { spec, lockedCommit, bundles: [] };
            group.bundles.push(bundle);
            byRevision.set(key, group);
        }
        const result = new Map<string, OpenedSource>();
        for (const { spec, lockedCommit, bundles: group } of byRevision.values()) {
            let opened: OpenedSource;
            try {
                opened = await this.open(spec, "lock", {
                    lockedCommit,
                    lockedSpec: spec,
                    requireLocked: options.locked,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const names = group.map((bundle) => bundle.bundleName);
                if (options.locked && message.includes("no resolvedCommit")) {
                    throw new Error(`Bundle '${names[0]}' has no resolvedCommit; run astp update before sync`);
                }
                throw new Error(
                    `Cannot read source '${spec}' of ${names.join(", ")}: ${message}\n` +
                        `To switch source: astp install ${names[0]} --source <spec> --platform ${this.target.platform} --target ${this.target.type}`,
                );
            }
            for (const bundle of group) result.set(bundle.bundleName, opened);
        }
        return result;
    }

    warnIfNewer(): void {
        for (const [key, { manifest, spec }] of this.opened) {
            if (this.warned.has(key)) continue;
            this.warned.add(key);
            const notice = checkManifestVersion(manifest);
            if (notice) {
                warnNewerManifest(
                    notice.manifestVersion,
                    notice.supportedVersion,
                    notice.updateCommand,
                    spec === DEFAULT_SOURCE ? undefined : spec,
                );
            }
        }
    }

    async close(): Promise<void> {
        for (const source of this.sources) await closeSource(source);
    }
}

export function mergeReports(reports: UpdateReport[]): UpdateReport {
    return {
        updates: reports.flatMap((report) => report.updates),
        upToDate: reports.flatMap((report) => report.upToDate),
        notInManifest: reports.flatMap((report) => report.notInManifest),
        legacySkills: reports.flatMap((report) => report.legacySkills),
    };
}

export function lockedRefRevisions(
    lockBundle: LockBundle | undefined,
    requireLocked = false,
    units?: readonly TemplateUnit[],
): ReadonlyMap<string, RevisionOptions> {
    const currentRefSources = new Map(
        (units ?? []).flatMap((unit) =>
            unit.kind === "skill" && unit.ref ? [[unit.relativePath, unit.ref.source] as const] : [],
        ),
    );
    const revisions = new Map<string, RevisionOptions>();
    for (const [unitPath, unit] of Object.entries(lockBundle?.units ?? {})) {
        if (!unit.ref || (units && currentRefSources.get(unitPath) !== unit.ref.source)) continue;
        revisions.set(unitPath, { lockedCommit: unit.ref.resolvedCommit, requireLocked });
    }
    return revisions;
}
