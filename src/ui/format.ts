/**
 * Labels a set of units by what they install: skills are whole directories,
 * files are grouped by their top-level install dir (`agents/`, `rules/`).
 */
export function describeUnitCounts(units: ReadonlyArray<{ kind: "file" | "skill"; path: string }>): string {
    const counts = { skill: 0, agent: 0, rule: 0, file: 0 };
    for (const unit of units) {
        if (unit.kind === "skill") counts.skill += 1;
        else if (unit.path.startsWith("agents/")) counts.agent += 1;
        else if (unit.path.startsWith("rules/")) counts.rule += 1;
        else counts.file += 1;
    }
    const parts: string[] = [];
    const push = (count: number, label: string) => {
        if (count > 0) parts.push(`${count} ${label}${count === 1 ? "" : "s"}`);
    };
    push(counts.skill, "skill");
    push(counts.agent, "agent");
    push(counts.rule, "rule");
    push(counts.file, "file");
    return parts.join(", ") || "0 files";
}
