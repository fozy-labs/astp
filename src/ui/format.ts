import type { InstallTargetType } from "@/types/index.js";

/**
 * Labels a set of units by what they install: skills are whole directories,
 * files are grouped by their top-level install dir (`agents/`, `rules/`).
 */
export function describeUnitCounts(units: ReadonlyArray<{ kind: "file" | "skill"; path: string }>): string {
    const counts = { skill: 0, agent: 0, rule: 0, file: 0 };
    for (const unit of units) counts[unitCountKind(unit)] += 1;
    return (
        UNIT_COUNT_KINDS.filter((kind) => counts[kind] > 0)
            .map((kind) => formatCount(kind, counts[kind], counts[kind]))
            .join(", ") || "0 files"
    );
}

export const UNIT_COUNT_KINDS = ["skill", "agent", "rule", "file"] as const;

export function unitCountKind(unit: { kind: "file" | "skill"; path: string }): (typeof UNIT_COUNT_KINDS)[number] {
    if (unit.kind === "skill") return "skill";
    if (unit.path.startsWith("agents/")) return "agent";
    if (unit.path.startsWith("rules/")) return "rule";
    return "file";
}

/** `9 blocks`, or `8/9 blocks` when only part is chosen; `mark` follows the number. */
export function formatCount(label: string, chosen: number, total: number, mark = ""): string {
    return `${chosen < total ? `${chosen}/${total}` : total}${mark} ${label}${total === 1 ? "" : "s"}`;
}

/** Double-quotes a shell argument that contains whitespace. */
export function shellArg(value: string): string {
    return /\s/.test(value) ? `"${value}"` : value;
}

/** The `install` retry hint for the given flags. */
export function installRetry(bundleName: string, flags: string[], target: InstallTargetType, source?: string): string {
    return `astp install ${bundleName} ${flags.join(" ")}${source !== undefined ? ` --source ${shellArg(source)}` : ""} --target ${target}`;
}
