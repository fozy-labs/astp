import path from "node:path";

import type { TemplateItem } from "@/types/index.js";

export interface FileTemplateUnit {
    kind: "file";
    relativePath: string;
    item: TemplateItem;
    optional?: boolean;
    labels?: string[];
}

export interface SkillTemplateUnit {
    kind: "skill";
    relativePath: string;
    items: TemplateItem[];
    optional?: boolean;
    labels?: string[];
}

export type TemplateUnit = FileTemplateUnit | SkillTemplateUnit;

export function groupTemplateItems(items: TemplateItem[]): TemplateUnit[] {
    const skillRoots = items
        .filter((item) => item.category === "skill" && item.target.endsWith("/SKILL.md"))
        .map((item) => path.posix.dirname(item.target));
    const skills = new Map<string, SkillTemplateUnit>();
    const units: TemplateUnit[] = [];

    for (const item of items) {
        if (item.category !== "skill") {
            units.push({
                kind: "file",
                relativePath: item.target,
                item,
                ...(item.optional !== undefined ? { optional: item.optional } : {}),
                ...(item.labels !== undefined ? { labels: item.labels } : {}),
            });
            continue;
        }

        const owningRoot = skillRoots
            .filter((root) => item.target.startsWith(`${root}/`))
            .sort((a, b) => (a.length < b.length ? -1 : a.length > b.length ? 1 : 0))[0];
        if (!owningRoot) {
            throw new Error(`Skill item '${item.target}' has no owning SKILL.md in the bundle.`);
        }
        const rootTarget = `${owningRoot}/SKILL.md`;
        if (item.target !== rootTarget && (item.optional !== undefined || item.labels !== undefined)) {
            throw new Error(
                `Skill item '${item.target}' cannot set 'optional' or 'labels'; set them on '${rootTarget}'.`,
            );
        }

        let skillUnit = skills.get(owningRoot);
        if (!skillUnit) {
            skillUnit = { kind: "skill", relativePath: owningRoot, items: [] };
            skills.set(owningRoot, skillUnit);
            units.push(skillUnit);
        }
        if (item.target === rootTarget) {
            if (item.optional !== undefined) skillUnit.optional = item.optional;
            if (item.labels !== undefined) skillUnit.labels = item.labels;
        }
        skillUnit.items.push(item);
    }

    return units;
}

export function resolveUnitPaths(
    requested: string[],
    units: Array<{ relativePath: string }>,
    bundleName: string,
): Set<string> {
    const resolved = new Set<string>();
    for (const value of requested) {
        const matches = units.filter(
            (unit) => unit.relativePath === value || path.posix.basename(unit.relativePath) === value,
        );
        if (matches.length === 0) {
            const available = [...new Set(units.map((unit) => path.posix.basename(unit.relativePath)))].sort();
            throw new Error(`Unknown unit '${value}' in bundle '${bundleName}'. Available: ${available.join(", ")}`);
        }
        if (matches.length > 1) {
            throw new Error(
                `Unit '${value}' is ambiguous in bundle '${bundleName}'. Use the full path: ${matches
                    .map((unit) => unit.relativePath)
                    .sort()
                    .join(", ")}`,
            );
        }
        resolved.add(matches[0]!.relativePath);
    }
    return resolved;
}
