import * as p from "@clack/prompts";

import { groupTemplateItems } from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type {
    Bundle,
    FileStatus,
    InstalledBundle,
    InstallTarget,
    InstallTargetType,
    Manifest,
    Platform,
    UpdateReport,
} from "@/types/index.js";
import { ALL_PLATFORMS, describeTarget, filterBundlesByPlatform, resolveTarget } from "@/types/index.js";

import { describeUnitCounts } from "./format.js";

// Re-export intro/outro for wizard usage
export const intro = p.intro;
export const outro = p.outro;
export const spinner = p.spinner;

export function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function selectAction(): Promise<"install" | "update" | "check" | "delete"> {
    const action = await p.select({
        message: "What would you like to do?",
        options: [
            { value: "install" as const, label: "Install bundles" },
            { value: "check" as const, label: "Check for updates" },
            { value: "update" as const, label: "Update installed files" },
            { value: "delete" as const, label: "Delete installed bundles" },
        ],
    });

    if (p.isCancel(action)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return action;
}

const PLATFORM_LABELS: Record<Platform, string> = {
    "claude-code": "Claude Code (.claude/, ~/.claude/)",
};

export async function selectPlatform(): Promise<Platform> {
    // With a single supported platform there is nothing to choose — skip the prompt.
    const [only] = ALL_PLATFORMS;
    if (ALL_PLATFORMS.length === 1 && only) return only;

    const platform = await p.select({
        message: "Which coding agent?",
        options: ALL_PLATFORMS.map((value) => ({ value, label: PLATFORM_LABELS[value] })),
    });

    if (p.isCancel(platform)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return platform;
}

export async function selectTarget(platform: Platform): Promise<InstallTarget> {
    const projectTarget = resolveTarget(platform, "project");
    const userTarget = resolveTarget(platform, "user");

    const type = await p.select({
        message: "Install to:",
        options: [
            { value: "project" as const, label: `Project level (${describeTarget(projectTarget)})` },
            { value: "user" as const, label: `User level (${describeTarget(userTarget)})` },
        ],
    });

    if (p.isCancel(type)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return resolveTarget(platform, type as InstallTargetType);
}

export async function selectBundles(manifest: Manifest, platform: Platform): Promise<Bundle[]> {
    const available = filterBundlesByPlatform(manifest, platform);
    if (available.length === 0) {
        p.cancel(`No bundles available for platform '${platform}'.`);
        process.exit(0);
    }

    const options = available.map((bundle) => {
        const units = groupTemplateItems(bundle.items);
        return {
            value: bundle.name,
            label: `${bundle.name} — ${bundle.description} (${describeUnitCounts(
                units.filter((unit) => unit.kind === "file").length,
                units.filter((unit) => unit.kind === "skill").length,
            )})`,
        };
    });

    const initialValues = available.filter((b) => b.default).map((b) => b.name);

    const selected = await p.multiselect({
        message: "Select bundles to install:\n(Space = toggle, Enter = confirm)",
        options,
        initialValues,
        required: true,
    });

    if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return (selected as string[]).map((name) => manifest.bundles[name]);
}

export async function confirmInstall(
    bundles: Bundle[],
    target: InstallTarget,
    selectedUnits?: TemplateUnit[],
): Promise<boolean> {
    const units = selectedUnits ?? bundles.flatMap((bundle) => groupTemplateItems(bundle.items));
    const fileCount = units.filter((unit) => unit.kind === "file").length;
    const skillCount = units.filter((unit) => unit.kind === "skill").length;
    const targetLabel = describeTarget(target);

    const confirmed = await p.confirm({
        message: `Install ${bundles.length} bundle${bundles.length === 1 ? "" : "s"} (${describeUnitCounts(fileCount, skillCount)}) to ${targetLabel}?`,
    });

    if (p.isCancel(confirmed)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return confirmed;
}

export async function selectUnits(bundle: Bundle, units: TemplateUnit[], initial: string[]): Promise<string[]> {
    const selected = await p.multiselect({
        message: `Select units from ${bundle.name}:\n(Space = toggle, Enter = confirm)`,
        options: units.map((unit) => ({
            value: unit.relativePath,
            label: pathLabel(unit.relativePath),
            hint: unit.relativePath,
        })),
        initialValues: initial,
        required: true,
    });
    if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }
    return selected as string[];
}

export async function selectNewUnits(bundleName: string, units: TemplateUnit[]): Promise<string[]> {
    const selected = await p.multiselect({
        message: `Select new units from ${bundleName}:\n(Space = toggle, Enter = confirm)`,
        options: units.map((unit) => ({
            value: unit.relativePath,
            label: pathLabel(unit.relativePath),
            hint: unit.relativePath,
        })),
        initialValues: units.map((unit) => unit.relativePath),
        required: false,
    });
    if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }
    return selected as string[];
}

export interface BlockOption {
    /** `<file target>#<name>`. */
    key: string;
    name: string;
    file: string;
}

export async function selectBlocks(unitPath: string, blocks: BlockOption[], initial: string[]): Promise<string[]> {
    const selected = await p.multiselect({
        message: `Select blocks in ${unitPath}:\n(Space = toggle, Enter = confirm)`,
        options: blocks.map((block) => ({ value: block.key, label: block.name, hint: block.file })),
        initialValues: initial,
        required: false,
    });
    if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }
    return selected as string[];
}

function pathLabel(relativePath: string): string {
    return relativePath.split("/").at(-1) ?? relativePath;
}

export async function selectInstalledBundles(installed: InstalledBundle[]): Promise<InstalledBundle[]> {
    const selected = await p.multiselect({
        message: "Select bundles to delete:\n(Space = toggle, Enter = confirm)",
        options: installed.map((bundle) => ({
            value: bundle.bundleName,
            label: `${bundle.bundleName} (${describeUnitCounts(
                bundle.units.filter((unit) => unit.kind === "file").length,
                bundle.units.filter((unit) => unit.kind === "skill").length,
            )})`,
        })),
        required: true,
    });

    if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    const selectedNames = new Set(selected as string[]);
    return installed.filter((bundle) => selectedNames.has(bundle.bundleName));
}

export async function confirmDelete(
    bundles: InstalledBundle[],
    target: InstallTarget,
    force: boolean,
): Promise<boolean> {
    const fileCount = bundles.reduce(
        (sum, bundle) => sum + bundle.units.filter((unit) => unit.kind === "file").length,
        0,
    );
    const skillCount = bundles.reduce(
        (sum, bundle) => sum + bundle.units.filter((unit) => unit.kind === "skill").length,
        0,
    );
    const targetLabel = describeTarget(target);

    const confirmed = await p.confirm({
        message: `Delete ${bundles.length} bundle${bundles.length === 1 ? "" : "s"} (${describeUnitCounts(fileCount, skillCount)}) from ${targetLabel}${force ? " with --force" : ""}?`,
    });

    if (p.isCancel(confirmed)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return confirmed;
}

export function showCheckReport(report: UpdateReport): void {
    const lines: string[] = [];
    lines.push("Bundle         Installed   Available   Status");

    for (const bundle of report.upToDate) {
        lines.push(
            `${bundle.bundleName.padEnd(15)}${bundle.version.padEnd(12)}${bundle.version.padEnd(12)}✓ Up to date`,
        );
    }

    for (const update of report.updates) {
        const status = update.installedVersion === update.availableVersion ? "↻ Out of sync" : "↑ Update available";
        lines.push(
            `${update.bundleName.padEnd(15)}${update.installedVersion.padEnd(12)}${update.availableVersion.padEnd(12)}${status}`,
        );
    }

    for (const bundle of report.notInManifest) {
        lines.push(`${bundle.bundleName.padEnd(15)}${bundle.version.padEnd(12)}${"—".padEnd(12)}? Not in manifest`);
    }

    if (report.legacySkills.length > 0) {
        lines.push("");
        for (const unit of report.legacySkills) {
            const guidance = !unit.inManifest
                ? "not in the current manifest, left in place."
                : unit.clean
                  ? "run `astp update` to migrate."
                  : "modified locally — `astp update --force` replaces it.";
            lines.push(`${unit.bundleName}: legacy ${unit.kind} ${unit.targetPath} — ${guidance}`);
        }
    }

    p.log.info(lines.join("\n"));
}

export function showUpdateReport(report: UpdateReport): void {
    const lines: string[] = [];

    for (const update of report.updates) {
        const skillCount = update.units.filter((unit) => unit.kind === "skill").length;
        const fileCount = update.units.filter((unit) => unit.kind === "file").length;
        const counts = describeUnitCounts(fileCount, skillCount);
        lines.push(
            update.installedVersion === update.availableVersion
                ? `${update.bundleName}: ${update.installedVersion} out of sync (${counts})`
                : `${update.bundleName}: ${update.installedVersion} → ${update.availableVersion} (${counts})`,
        );
    }

    for (const bundle of report.notInManifest) {
        lines.push(`${bundle.bundleName}: not in the current manifest, left in place.`);
    }

    if (lines.length > 0) p.log.info(lines.join("\n"));
}

export function warnModified(files: FileStatus[]): void {
    const paths = files.map((f) => `  • ${f.targetPath}`).join("\n");
    const skillCount = files.filter((file) => file.kind === "skill").length;
    const fileCount = files.filter((file) => file.kind === "file").length;
    p.log.warn(
        `${describeUnitCounts(fileCount, skillCount)} modified locally — skipped:\n${paths}\nRun \`astp update --force\` to overwrite them.`,
    );
}

export function warnKeptRemoved(units: FileStatus[]): void {
    const paths = units.map((unit) => `  • ${unit.targetPath}`).join("\n");
    const skillCount = units.filter((unit) => unit.kind === "skill").length;
    const fileCount = units.filter((unit) => unit.kind === "file").length;
    p.log.warn(
        `${describeUnitCounts(fileCount, skillCount)} not selected or removed upstream but modified locally — kept:\n${paths}\nUse --force to delete them.`,
    );
}

export function warnKeptBlocks(keys: string[]): void {
    const list = keys.map((key) => `  • ${key}`).join("\n");
    p.log.warn(
        `${keys.length} block${keys.length === 1 ? "" : "s"} not selected or removed upstream but changed locally — kept:\n${list}\nUse --force to delete them.`,
    );
}

export function warnBlockConflicts(keys: string[]): void {
    const list = keys.map((key) => `  • ${key}`).join("\n");
    p.log.warn(
        `${keys.length} block${keys.length === 1 ? "" : "s"} changed locally and in the template — the new version was added as a <FILL_INSTRUCTION>:\n${list}`,
    );
}

export function warnLegacyModified(files: FileStatus[]): void {
    const paths = files.map((file) => `  • ${file.targetPath}`).join("\n");
    p.log.warn(`Legacy units modified locally — skipped:\n${paths}\nRun \`astp update --force\` to replace them.`);
}

export function showSuccess(message: string): void {
    p.log.success(message);
}

export function showInfo(message: string): void {
    p.log.info(message);
}
