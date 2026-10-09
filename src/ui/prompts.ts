import { styleText } from "node:util";

import { MultiSelectPrompt, wrapTextWithPrefix } from "@clack/core";
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

/** Without a terminal a prompt never settles, so fail with what to pass instead. */
export function requireTerminal(message: string): void {
    if (!isInteractive()) throw new Error(message);
}

export async function selectAction(): Promise<"install" | "update" | "check" | "delete"> {
    requireTerminal("astp needs a command without a terminal; run astp --help");
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
    requireTerminal(`--platform is required without a terminal (${ALL_PLATFORMS.join("|")})`);

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
    requireTerminal("--target is required without a terminal (project|user)");
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

interface BundleOption {
    value: string;
    label?: string;
    hint?: string;
}

/**
 * Bundle multiselect where → on an option submits with `customize` set to it.
 * Left/right are cursor aliases in core's MultiSelectPrompt, so right is
 * intercepted in `emit` before the cursor moves and finalizes the prompt.
 */
export class BundleSelectPrompt extends MultiSelectPrompt<BundleOption> {
    customize?: string;

    emit(event: string, ...data: unknown[]): void {
        if (event === "cursor" && data[0] === "right") {
            const option = this.options[this.cursor];
            if (option) {
                this.customize = option.value;
                if (!(this.value ?? []).includes(option.value)) this.value = [...(this.value ?? []), option.value];
                this.state = "submit";
            }
            return;
        }
        (super.emit as (event: string, ...data: unknown[]) => void)(event, ...data);
    }
}

type OptionRenderState = "active" | "selected" | "cancelled" | "active-selected" | "submitted" | "inactive";

// Mirrors @clack/prompts 1.1.0 multiselect's render so the bundle screen
// looks identical to the other prompts.
function renderBundleOption(option: BundleOption, state: OptionRenderState): string {
    const label = option.label ?? String(option.value);
    const mapLines = (text: string, format: (line: string) => string) => text.split("\n").map(format).join("\n");
    const hint = option.hint ? ` ${styleText("dim", `(${option.hint})`)}` : "";
    switch (state) {
        case "active":
            return `${styleText("cyan", p.S_CHECKBOX_ACTIVE)} ${label}${hint}`;
        case "selected":
            return `${styleText("green", p.S_CHECKBOX_SELECTED)} ${mapLines(label, (line) => styleText("dim", line))}${hint}`;
        case "cancelled":
            return mapLines(label, (line) => styleText(["strikethrough", "dim"], line));
        case "active-selected":
            return `${styleText("green", p.S_CHECKBOX_SELECTED)} ${label}${hint}`;
        case "submitted":
            return mapLines(label, (line) => styleText("dim", line));
        default:
            return `${styleText("dim", p.S_CHECKBOX_INACTIVE)} ${mapLines(label, (line) => styleText("dim", line))}`;
    }
}

export interface BundlePick {
    selected: string[];
    customize?: string;
}

export async function selectBundles(
    manifest: Manifest,
    platform: Platform,
    state?: { selected: string[]; cursor?: string; notes?: Map<string, string> },
): Promise<BundlePick> {
    const available = filterBundlesByPlatform(manifest, platform);
    if (available.length === 0) {
        p.cancel(`No bundles available for platform '${platform}'.`);
        process.exit(0);
    }

    const message = "Select bundles to install:\n(Space = toggle, → = customize, Enter = confirm)";
    const options = available.map((bundle) => {
        const units = groupTemplateItems(bundle.items);
        const note = state?.notes?.get(bundle.name);
        return {
            value: bundle.name,
            label: `${bundle.name} — ${bundle.description} (${describeUnitCounts(
                units.map((unit) => ({ kind: unit.kind, path: unit.relativePath })),
            )})${note ? ` ${note}` : ""}`,
        };
    });

    const initialValues = state?.selected ?? available.filter((b) => b.default).map((b) => b.name);

    const prompt = new BundleSelectPrompt({
        options,
        initialValues,
        cursorAt: state?.cursor,
        required: true,
        validate: (value) => {
            if (value === undefined || value.length === 0) {
                return `Please select at least one option.\n${styleText(
                    "reset",
                    styleText(
                        "dim",
                        `Press ${styleText(["gray", "bgWhite", "inverse"], " space ")} to select, ${styleText("gray", styleText("bgWhite", styleText("inverse", " enter ")))} to submit`,
                    ),
                )}`;
            }
        },
        render() {
            const title = `${styleText("gray", p.S_BAR)}\n${wrapTextWithPrefix(
                undefined,
                message,
                `${p.symbolBar(this.state)}  `,
                `${p.symbol(this.state)}  `,
            )}\n`;
            const value = this.value ?? [];
            const styleOption = (option: BundleOption, active: boolean): string => {
                const selected = value.includes(option.value);
                if (active && selected) return renderBundleOption(option, "active-selected");
                if (selected) return renderBundleOption(option, "selected");
                return renderBundleOption(option, active ? "active" : "inactive");
            };
            switch (this.state) {
                case "submit": {
                    const selectedOptions =
                        this.options
                            .filter((option) => value.includes(option.value))
                            .map((option) => renderBundleOption(option, "submitted"))
                            .join(styleText("dim", ", ")) || styleText("dim", "none");
                    return `${title}${wrapTextWithPrefix(undefined, selectedOptions, `${styleText("gray", p.S_BAR)}  `)}`;
                }
                case "cancel": {
                    const cancelled = this.options
                        .filter((option) => value.includes(option.value))
                        .map((option) => renderBundleOption(option, "cancelled"))
                        .join(styleText("dim", ", "));
                    if (cancelled.trim() === "") return `${title}${styleText("gray", p.S_BAR)}`;
                    return `${title}${wrapTextWithPrefix(undefined, cancelled, `${styleText("gray", p.S_BAR)}  `)}\n${styleText("gray", p.S_BAR)}`;
                }
                case "error": {
                    const bar = `${styleText("yellow", p.S_BAR)}  `;
                    const errorText = this.error
                        .split("\n")
                        .map((line, index) =>
                            index === 0
                                ? `${styleText("yellow", p.S_BAR_END)}  ${styleText("yellow", line)}`
                                : `   ${line}`,
                        )
                        .join("\n");
                    const titleLines = title.split("\n").length;
                    const errorLines = errorText.split("\n").length + 1;
                    return `${title}${bar}${p
                        .limitOptions({
                            output: undefined,
                            options: this.options,
                            cursor: this.cursor,
                            columnPadding: bar.length,
                            rowPadding: titleLines + errorLines,
                            style: styleOption,
                        })
                        .join(`\n${bar}`)}\n${errorText}\n`;
                }
                default: {
                    const bar = `${styleText("cyan", p.S_BAR)}  `;
                    const titleLines = title.split("\n").length;
                    return `${title}${bar}${p
                        .limitOptions({
                            output: undefined,
                            options: this.options,
                            cursor: this.cursor,
                            columnPadding: bar.length,
                            rowPadding: titleLines + 2,
                            style: styleOption,
                        })
                        .join(`\n${bar}`)}\n${styleText("cyan", p.S_BAR_END)}\n`;
                }
            }
        },
    });

    const selected = await prompt.prompt();

    if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return { selected: selected as string[], customize: prompt.customize };
}

export async function confirmInstall(
    bundles: Bundle[],
    target: InstallTarget,
    selectedUnits?: TemplateUnit[],
): Promise<boolean> {
    const units = selectedUnits ?? bundles.flatMap((bundle) => groupTemplateItems(bundle.items));
    const targetLabel = describeTarget(target);

    const confirmed = await p.confirm({
        message: `Install ${bundles.length} bundle${bundles.length === 1 ? "" : "s"} (${describeUnitCounts(
            units.map((unit) => ({ kind: unit.kind, path: unit.relativePath })),
        )}) to ${targetLabel}?`,
    });

    if (p.isCancel(confirmed)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return confirmed;
}

export async function selectUnits(bundle: Bundle, units: TemplateUnit[], initial: string[]): Promise<string[]> {
    const selected = await p.multiselect({
        message: `Select items from ${bundle.name}:\n(Space = toggle, Enter = back to bundles)`,
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
        message: `Select new items from ${bundleName}:\n(Space = toggle, Enter = confirm)`,
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
                bundle.units.map((unit) => ({ kind: unit.kind, path: unit.relativePath })),
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
    const units = bundles.flatMap((bundle) => bundle.units);
    const targetLabel = describeTarget(target);

    const confirmed = await p.confirm({
        message: `Delete ${bundles.length} bundle${bundles.length === 1 ? "" : "s"} (${describeUnitCounts(
            units.map((unit) => ({ kind: unit.kind, path: unit.relativePath })),
        )}) from ${targetLabel}${force ? " with --force" : ""}?`,
    });

    if (p.isCancel(confirmed)) {
        p.cancel("Cancelled.");
        process.exit(0);
    }

    return confirmed;
}

export function showCheckReport(report: UpdateReport, target: InstallTargetType): void {
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
                  ? `run \`astp update --target ${target}\` to migrate.`
                  : `modified locally — \`astp update --force --target ${target}\` replaces it.`;
            lines.push(`${unit.bundleName}: legacy ${unit.kind} ${unit.targetPath} — ${guidance}`);
        }
    }

    p.log.info(lines.join("\n"));
}

export function showUpdateReport(report: UpdateReport): void {
    const lines: string[] = [];

    for (const update of report.updates) {
        const counts = describeUnitCounts(update.units.map((unit) => ({ kind: unit.kind, path: unit.targetPath })));
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

export function warnModified(files: FileStatus[], command: string): void {
    const paths = files.map((f) => `  • ${f.targetPath}`).join("\n");
    p.log.warn(
        `${describeUnitCounts(files.map((file) => ({ kind: file.kind, path: file.targetPath })))} modified locally — skipped:\n${paths}\nRun \`${command}\` to overwrite them.`,
    );
}

export function warnKeptRemoved(units: FileStatus[]): void {
    const paths = units.map((unit) => `  • ${unit.targetPath}`).join("\n");
    p.log.warn(
        `${describeUnitCounts(units.map((unit) => ({ kind: unit.kind, path: unit.targetPath })))} not selected or removed upstream but modified locally — kept:\n${paths}\nUse --force to delete them.`,
    );
}

export function warnReleased(units: FileStatus[], blockKeys: string[]): void {
    const list = [...units.map((unit) => unit.targetPath), ...blockKeys].map((entry) => `  • ${entry}`).join("\n");
    p.log.warn(`Removed upstream but changed locally — left in place, no longer managed by astp:\n${list}`);
}

export function warnForeign(
    bundleName: string,
    units: FileStatus[],
    blockKeys: string[],
    target: InstallTargetType,
): void {
    const list = [...units.map((unit) => unit.targetPath), ...blockKeys].map((entry) => `  • ${entry}`).join("\n");
    const commands = [
        ...units.map((unit) => `  astp install ${bundleName} --skill ${unit.targetPath} --force --target ${target}`),
        ...blockKeys.map((key) => `  astp install ${bundleName} --block ${key} --force --target ${target}`),
    ].join("\n");
    p.log.warn(
        `Already present with other content — left untouched, recorded as declined:\n${list}\nTo overwrite, run:\n${commands}`,
    );
}

export function warnKeptBlocks(keys: string[]): void {
    const list = keys.map((key) => `  • ${key}`).join("\n");
    p.log.warn(
        `${keys.length} block${keys.length === 1 ? "" : "s"} not selected but changed locally — kept:\n${list}\nUse --force to delete them.`,
    );
}

export function warnBlockConflicts(keys: string[]): void {
    const list = keys.map((key) => `  • ${key}`).join("\n");
    p.log.warn(
        `${keys.length} block${keys.length === 1 ? "" : "s"} changed locally and in the template — the new version was added as a <FILL_INSTRUCTION>:\n${list}`,
    );
}

export function warnLegacyModified(files: FileStatus[], target: InstallTargetType): void {
    const paths = files.map((file) => `  • ${file.targetPath}`).join("\n");
    p.log.warn(
        `Legacy units modified locally — skipped:\n${paths}\nRun \`astp update --force --target ${target}\` to replace them.`,
    );
}

export function showSuccess(message: string): void {
    p.log.success(message);
}

export function showInfo(message: string): void {
    p.log.info(message);
}
