export function describeUnitCounts(fileCount: number, skillCount: number): string {
    const counts: string[] = [];
    if (skillCount > 0) counts.push(`${skillCount} skill${skillCount === 1 ? "" : "s"}`);
    if (fileCount > 0) counts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
    return counts.join(", ") || "0 files";
}
