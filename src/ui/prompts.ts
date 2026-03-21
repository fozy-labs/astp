import * as p from "@clack/prompts";

import type { Bundle, FileStatus, InstallTarget, InstallTargetType, Manifest, UpdateReport } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";

// Re-export intro/outro for wizard usage
export const intro = p.intro;
export const outro = p.outro;
export const spinner = p.spinner;

export async function selectAction(): Promise<"install" | "update" | "check"> {
    const action = await p.select({
        message: "What would you like to do?",
        options: [
            { value: "install" as const, label: "Install bundles" },
            { value: "check" as const, label: "Check for updates" },
            { value: "update" as const, label: "Update installed files" },
        ],
    });

    if (p.isCancel(action)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return action;
}

export async function selectTarget(): Promise<InstallTarget> {
    const type = await p.select({
        message: "Install to:",
        options: [
            { value: "project" as const, label: "Project level (.github/)" },
            { value: "user" as const, label: "User level (~/.copilot/)" },
        ],
    });

    if (p.isCancel(type)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return resolveTarget(type as InstallTargetType);
}

export async function selectBundles(manifest: Manifest): Promise<Bundle[]> {
    const options = Object.values(manifest.bundles).map((bundle) => ({
        value: bundle.name,
        label: `${bundle.name} — ${bundle.description} (${bundle.items.length} file${bundle.items.length === 1 ? "" : "s"})`,
    }));

    const initialValues = Object.values(manifest.bundles)
        .filter((b) => b.default)
        .map((b) => b.name);

    const selected = await p.multiselect({
        message: "Select bundles to install:",
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

export async function confirmInstall(bundles: Bundle[], target: InstallTarget): Promise<boolean> {
    const totalFiles = bundles.reduce((sum, b) => sum + b.items.length, 0);
    const targetLabel = target.type === "project" ? ".github/" : "~/.copilot/";

    const confirmed = await p.confirm({
        message: `Install ${bundles.length} bundle${bundles.length === 1 ? "" : "s"} (${totalFiles} file${totalFiles === 1 ? "" : "s"}) to ${targetLabel}?`,
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
        lines.push(
            `${update.bundleName.padEnd(15)}${update.installedVersion.padEnd(12)}${update.availableVersion.padEnd(12)}↑ Update available`,
        );
    }

    for (const bundle of report.notInManifest) {
        lines.push(`${bundle.bundleName.padEnd(15)}${bundle.version.padEnd(12)}${"—".padEnd(12)}? Not in manifest`);
    }

    p.log.info(lines.join("\n"));
}

export function showUpdateReport(report: UpdateReport): void {
    const lines: string[] = [];

    for (const update of report.updates) {
        lines.push(
            `${update.bundleName}: ${update.installedVersion} → ${update.availableVersion} (${update.files.length} file${update.files.length === 1 ? "" : "s"})`,
        );
    }

    p.log.info(lines.join("\n"));
}

export function warnModified(files: FileStatus[]): void {
    const paths = files.map((f) => `  • ${f.targetPath}`).join("\n");
    p.log.warn(
        `${files.length} file${files.length === 1 ? "" : "s"} modified locally — skipped:\n${paths}\nUse --force to overwrite.`,
    );
}

export function showSuccess(message: string): void {
    p.log.success(message);
}

export function showInfo(message: string): void {
    p.log.info(message);
}
