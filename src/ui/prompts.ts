import { styleText } from "node:util";

import { Prompt, wrapTextWithPrefix } from "@clack/core";
import type { PromptOptions } from "@clack/core";
import * as p from "@clack/prompts";

import { groupTemplateItems } from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type {
    Bundle,
    FileStatus,
    InstalledBundle,
    InstallTarget,
    InstallTargetType,
    Platform,
    UpdateReport,
} from "@/types/index.js";
import { ALL_PLATFORMS, describeTarget, resolveTarget } from "@/types/index.js";

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

export interface BlockOption {
    /** `<file target>#<name>`. */
    key: string;
    name: string;
    file: string;
}

export interface BundleEntry {
    /** Resolved bundle (items from its lock source). */
    bundle: Bundle;
    /** `groupTemplateItems(bundle.items)`. */
    units: TemplateUnit[];
    /** Unit paths Space selects on an empty bundle: all minus the lock's declines. */
    defaults: string[];
    /** Initially selected with `defaults`. */
    preselected: boolean;
    /** Unit path → its selectable blocks; units without blocks are absent. */
    blocks: Map<string, BlockOption[]>;
    /** Block keys checked at start: lock choices, else the non-optional blocks. */
    blockDefaults: string[];
}

/** What the tree returns per chosen bundle. */
export interface BundleChoice {
    units: string[];
    /** Chosen block keys of the chosen units. */
    blocks: string[];
}

interface TreeRow {
    entry: BundleEntry;
    /** Present on item and block rows, absent on bundle rows. */
    unit?: TemplateUnit;
    /** Present on block rows. */
    block?: BlockOption;
}

type OptionRenderState = "active" | "selected" | "cancelled" | "active-selected" | "submitted" | "inactive";

// Mirrors @clack/prompts 1.1.0 multiselect's option render so the tree rows
// look identical to the other prompts.
function renderBundleOption(
    option: { value: string; label?: string; hint?: string },
    state: OptionRenderState,
): string {
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

function rowState(active: boolean, selected: boolean): OptionRenderState {
    return active && selected ? "active-selected" : selected ? "selected" : active ? "active" : "inactive";
}

/**
 * Bundle, item and block selection on one screen: a collapsed tree of
 * bundles → items → blocks whose child rows appear under → and hide under ←.
 * A single bundle starts expanded. Extends the base Prompt — the MultiSelect
 * subclasses own the `cursor` event over a flat list, which fights hidden rows.
 */
export class BundleTreePrompt extends Prompt<Map<string, BundleChoice>> {
    /** Bundle names whose item rows are visible. */
    readonly expanded = new Set<string>();
    /** `unitKey` of items whose block rows are visible. */
    readonly expandedUnits = new Set<string>();
    /** Bundle name → chosen unit paths (every entry is present, possibly empty). */
    readonly chosen = new Map<string, Set<string>>();
    /** Bundle name → checked block keys, kept while their item is deselected. */
    readonly chosenBlocks = new Map<string, Set<string>>();
    cursor = 0;

    readonly entries: BundleEntry[];

    constructor(opts: PromptOptions<Map<string, BundleChoice>, BundleTreePrompt> & { entries: BundleEntry[] }) {
        super(opts, false);
        this.entries = opts.entries;
        for (const entry of this.entries) {
            this.chosen.set(entry.bundle.name, new Set(entry.preselected ? entry.defaults : []));
            this.chosenBlocks.set(entry.bundle.name, new Set(entry.blockDefaults));
        }
        const [only] = this.entries;
        if (this.entries.length === 1 && only) this.expanded.add(only.bundle.name);
        this.refreshValue();
        this.on("cursor", (key) => this.move(key));
    }

    /** Bundle rows plus the item and block rows of expanded ones, in manifest order. */
    get rows(): TreeRow[] {
        const rows: TreeRow[] = [];
        for (const entry of this.entries) {
            rows.push({ entry });
            if (!this.expanded.has(entry.bundle.name)) continue;
            for (const unit of entry.units) {
                rows.push({ entry, unit });
                if (!this.expandedUnits.has(unitKey(entry, unit))) continue;
                for (const block of entry.blocks.get(unit.relativePath) ?? []) rows.push({ entry, unit, block });
            }
        }
        return rows;
    }

    renderRow(row: TreeRow, active: boolean): string {
        const set = this.chosen.get(row.entry.bundle.name)!;
        const blockSet = this.chosenBlocks.get(row.entry.bundle.name)!;
        if (row.unit && row.block) {
            const blocks = row.entry.blocks.get(row.unit.relativePath)!;
            const severalFiles = new Set(blocks.map((block) => block.file)).size > 1;
            const option = {
                value: row.block.key,
                label: row.block.name,
                hint: severalFiles ? row.block.file : undefined,
            };
            const selected = set.has(row.unit.relativePath) && blockSet.has(row.block.key);
            return `    ${renderBundleOption(option, rowState(active, selected))}`;
        }
        if (row.unit) {
            const selected = set.has(row.unit.relativePath);
            const blocks = row.entry.blocks.get(row.unit.relativePath) ?? [];
            const checked = blocks.filter((block) => blockSet.has(block.key)).length;
            const option = {
                value: row.unit.relativePath,
                label: pathLabel(row.unit.relativePath),
                hint:
                    selected && checked < blocks.length
                        ? `${row.unit.relativePath}, ${checked}/${blocks.length} blocks`
                        : row.unit.relativePath,
            };
            return `  ${renderBundleOption(option, rowState(active, selected))}`;
        }
        const { bundle } = row.entry;
        const option = {
            value: bundle.name,
            label: `${bundle.name} — ${bundle.description} (${describeUnitCounts(
                row.entry.units.map((unit) => ({ kind: unit.kind, path: unit.relativePath })),
            )})`,
            hint:
                set.size > 0 && set.size < row.entry.units.length ? `${set.size}/${row.entry.units.length}` : undefined,
        };
        return renderBundleOption(option, rowState(active, set.size > 0));
    }

    private refreshValue(): void {
        const result = new Map<string, BundleChoice>();
        for (const entry of this.entries) {
            const set = this.chosen.get(entry.bundle.name)!;
            const blockSet = this.chosenBlocks.get(entry.bundle.name)!;
            if (set.size === 0) continue;
            const units = entry.units.filter((unit) => set.has(unit.relativePath)).map((unit) => unit.relativePath);
            const blocks = units.flatMap((unitPath) =>
                (entry.blocks.get(unitPath) ?? []).filter((block) => blockSet.has(block.key)).map((block) => block.key),
            );
            result.set(entry.bundle.name, { units, blocks });
        }
        this.value = result;
    }

    private move(key?: string): void {
        const rows = this.rows;
        const row = rows[this.cursor];
        switch (key) {
            case "up":
                this.cursor = (this.cursor - 1 + rows.length) % rows.length;
                break;
            case "down":
                this.cursor = (this.cursor + 1) % rows.length;
                break;
            case "right":
                if (!row || row.block) break;
                if (row.unit) {
                    if (row.entry.blocks.has(row.unit.relativePath))
                        this.expandedUnits.add(unitKey(row.entry, row.unit));
                } else if (row.entry.units.length > 0) {
                    this.expanded.add(row.entry.bundle.name);
                }
                break;
            case "left":
                if (!row) break;
                if (row.unit && row.block) {
                    this.expandedUnits.delete(unitKey(row.entry, row.unit));
                    this.cursor = this.rows.findIndex((r) => r.unit === row.unit && !r.block);
                } else if (row.unit) {
                    this.expanded.delete(row.entry.bundle.name);
                    this.cursor = this.rows.findIndex((r) => r.entry === row.entry && !r.unit);
                } else {
                    this.expanded.delete(row.entry.bundle.name);
                }
                break;
            case "space": {
                if (!row) break;
                const set = this.chosen.get(row.entry.bundle.name)!;
                if (row.unit && row.block) {
                    const blockSet = this.chosenBlocks.get(row.entry.bundle.name)!;
                    if (!set.has(row.unit.relativePath)) {
                        set.add(row.unit.relativePath);
                        blockSet.add(row.block.key);
                    } else if (blockSet.has(row.block.key)) {
                        blockSet.delete(row.block.key);
                    } else {
                        blockSet.add(row.block.key);
                    }
                } else if (row.unit) {
                    if (set.has(row.unit.relativePath)) set.delete(row.unit.relativePath);
                    else set.add(row.unit.relativePath);
                } else if (set.size === 0) {
                    const paths =
                        row.entry.defaults.length > 0
                            ? row.entry.defaults
                            : row.entry.units.map((unit) => unit.relativePath);
                    for (const unitPath of paths) set.add(unitPath);
                } else {
                    set.clear();
                }
                break;
            }
        }
        this.refreshValue();
    }
}

function unitKey(entry: BundleEntry, unit: TemplateUnit): string {
    return `${entry.bundle.name}\n${unit.relativePath}`;
}

export function cancelNoBundles(platform: Platform): never {
    p.cancel(`No bundles available for platform '${platform}'.`);
    process.exit(0);
}

export async function selectBundleItems(entries: BundleEntry[]): Promise<Map<string, BundleChoice>> {
    const message = "Select bundles and items:\n(Space = toggle, → = expand, ← = collapse, Enter = confirm)";

    const prompt = new BundleTreePrompt({
        entries,
        validate: (value) => {
            if (!value || value.size === 0) {
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
            const rows = this.rows;
            const styleRow = (row: TreeRow, active: boolean): string => this.renderRow(row, active);
            const chosenBundles = this.entries.filter((entry) => this.chosen.get(entry.bundle.name)!.size > 0);
            switch (this.state) {
                case "submit": {
                    const submitted =
                        chosenBundles
                            .map((entry) => {
                                const set = this.chosen.get(entry.bundle.name)!;
                                const partial =
                                    set.size < entry.units.length ? ` (${set.size}/${entry.units.length})` : "";
                                return renderBundleOption(
                                    { value: entry.bundle.name, label: `${entry.bundle.name}${partial}` },
                                    "submitted",
                                );
                            })
                            .join(styleText("dim", ", ")) || styleText("dim", "none");
                    return `${title}${wrapTextWithPrefix(undefined, submitted, `${styleText("gray", p.S_BAR)}  `)}`;
                }
                case "cancel": {
                    const cancelled = chosenBundles
                        .map((entry) => renderBundleOption({ value: entry.bundle.name }, "cancelled"))
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
                            options: rows,
                            cursor: this.cursor,
                            columnPadding: bar.length,
                            rowPadding: titleLines + errorLines,
                            style: styleRow,
                        })
                        .join(`\n${bar}`)}\n${errorText}\n`;
                }
                default: {
                    const bar = `${styleText("cyan", p.S_BAR)}  `;
                    const titleLines = title.split("\n").length;
                    return `${title}${bar}${p
                        .limitOptions({
                            output: undefined,
                            options: rows,
                            cursor: this.cursor,
                            columnPadding: bar.length,
                            rowPadding: titleLines + 2,
                            style: styleRow,
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

    return selected as Map<string, BundleChoice>;
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
