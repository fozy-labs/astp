import { closeSource, DEFAULT_SOURCE, fetchManifest, formatSource, resolveSource } from "@/core/index.js";
import type { Lock, ManifestSource } from "@/core/index.js";
import type { InstalledBundle, InstallTarget, Manifest, UpdateReport } from "@/types/index.js";

export interface OpenedSource {
    source: ManifestSource;
    /** String recorded in `astp.lock`. */
    spec: string;
    manifest: Manifest;
}

/** Opens each source once per command; `close` removes their downloads. */
export class Sources {
    private readonly opened = new Map<string, OpenedSource>();
    private readonly sources: ManifestSource[] = [];

    constructor(private readonly target: InstallTarget) {}

    /** `--source` values resolve against the cwd, lock values against the lock's directory. */
    async open(spec: string, from: "cli" | "lock"): Promise<OpenedSource> {
        const source = await resolveSource(spec, from === "cli" ? process.cwd() : this.target.rootDir);
        const key = formatSource(source, this.target);
        const existing = this.opened.get(key);
        if (existing) return existing;
        this.sources.push(source);
        const opened = { source, spec: key, manifest: await fetchManifest(source) };
        this.opened.set(key, opened);
        return opened;
    }

    /** Each installed bundle's lock source (legacy units: the default), with the bundle's name in errors. */
    async openInstalled(bundles: InstalledBundle[], lock: Lock): Promise<Map<string, OpenedSource>> {
        const bySpec = new Map<string, InstalledBundle[]>();
        for (const bundle of bundles) {
            const spec = lock.bundles[bundle.bundleName]?.source ?? DEFAULT_SOURCE;
            bySpec.set(spec, [...(bySpec.get(spec) ?? []), bundle]);
        }
        const result = new Map<string, OpenedSource>();
        for (const [spec, group] of bySpec) {
            let opened: OpenedSource;
            try {
                opened = await this.open(spec, "lock");
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const names = group.map((bundle) => bundle.bundleName);
                throw new Error(
                    `Cannot read source '${spec}' of ${names.join(", ")}: ${message}\n` +
                        `To switch source: astp install ${names[0]} --source <spec>`,
                );
            }
            for (const bundle of group) result.set(bundle.bundleName, opened);
        }
        return result;
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
