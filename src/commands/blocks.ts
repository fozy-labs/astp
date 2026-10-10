import type { BlockSelections, LockUnit, UnitBlockFile } from "@/core/index.js";
import type { BlockOption } from "@/ui/prompts.js";
import { isInteractive, selectBlocks } from "@/ui/prompts.js";

interface BlockEntry extends BlockOption {
    required: boolean;
}

function unitBlockEntries(blockFiles: Map<string, UnitBlockFile>): BlockEntry[] {
    const entries: BlockEntry[] = [];
    for (const [target, file] of blockFiles) {
        for (const block of file.blocks) {
            entries.push({
                key: `${target}#${block.name}`,
                name: block.name,
                file: target,
                optional: block.optional,
                required: block.required,
            });
        }
    }
    return entries;
}

function toSelections(entries: BlockEntry[], selectedKeys: Set<string>): BlockSelections {
    const selections: BlockSelections = new Map();
    for (const entry of entries) {
        const selection = selections.get(entry.file) ?? { selected: new Set<string>(), declined: new Set<string>() };
        (selectedKeys.has(entry.key) ? selection.selected : selection.declined).add(entry.name);
        selections.set(entry.file, selection);
    }
    return selections;
}

/**
 * Resolves `--block` values (a block name or a `file#name` key) to keys,
 * grouped by unit path.
 */
export function resolveBlockKeys(
    requested: string[],
    units: Map<string, Map<string, UnitBlockFile>>,
    bundleName: string,
): Map<string, Set<string>> {
    const entries = [...units].flatMap(([unitPath, blockFiles]) =>
        unitBlockEntries(blockFiles).map((entry) => ({ ...entry, unitPath })),
    );
    const resolved = new Map<string, Set<string>>();
    for (const value of requested) {
        const matches = entries.filter((entry) => entry.key === value || entry.name === value);
        if (matches.length === 0) {
            const available = [
                ...new Set(entries.filter((entry) => !entry.required).map((entry) => entry.name)),
            ].sort();
            const hint = available.length > 0 ? `Available: ${available.join(", ")}` : "The bundle has no blocks.";
            throw new Error(`Unknown block '${value}' in bundle '${bundleName}'. ${hint}`);
        }
        if (matches.length > 1) {
            throw new Error(
                `Block '${value}' is ambiguous in bundle '${bundleName}'. Use the key: ${matches
                    .map((entry) => entry.key)
                    .sort()
                    .join(", ")}`,
            );
        }
        const match = matches[0]!;
        resolved.set(match.unitPath, (resolved.get(match.unitPath) ?? new Set()).add(match.key));
    }
    return resolved;
}

/** Blocks the install tree offers for a unit: every block except required ones. */
export function installBlockOptions(blockFiles: Map<string, UnitBlockFile>): BlockOption[] {
    return unitBlockEntries(blockFiles)
        .filter((entry) => !entry.required)
        .map(({ key, name, file, optional }) => ({ key, name, file, optional }));
}

/**
 * Blocks pre-checked in the install tree: lock selections plus new
 * non-optional blocks (a unit without lock blocks starts with all non-optional).
 */
export function initialInstallBlocks(blockFiles: Map<string, UnitBlockFile>, lockUnit: LockUnit | undefined): string[] {
    const lockSelected = new Set(Object.keys(lockUnit?.blocks ?? {}));
    const lockDeclined = new Set(lockUnit?.declinedBlocks ?? []);
    const tracked = Boolean(lockUnit?.blocks || lockUnit?.declinedBlocks);
    return unitBlockEntries(blockFiles)
        .filter(
            (entry) =>
                !entry.required &&
                (tracked
                    ? lockSelected.has(entry.key) || (!lockDeclined.has(entry.key) && !entry.optional)
                    : !entry.optional),
        )
        .map((entry) => entry.key);
}

/**
 * `install`: required blocks are always selected. `chosen` holds the keys
 * picked in the install tree. Without it (non-TTY, --skill or --block) all
 * non-optional blocks plus optional ones already in the lock are selected;
 * with `additive` lock declines are kept instead. `requested` keys are always selected.
 */
export function selectInstallBlocks(
    blockFiles: Map<string, UnitBlockFile>,
    lockUnit: LockUnit | undefined,
    options: { additive: boolean; requested?: Set<string>; chosen?: Set<string> },
): BlockSelections {
    const entries = unitBlockEntries(blockFiles);
    const requested = options.requested ?? new Set<string>();
    const selectedKeys = new Set(
        entries.filter((entry) => entry.required || requested.has(entry.key)).map((entry) => entry.key),
    );
    const lockSelected = new Set(Object.keys(lockUnit?.blocks ?? {}));
    const lockDeclined = new Set(lockUnit?.declinedBlocks ?? []);
    const keepDeclines = options.additive && Boolean(lockUnit?.blocks || lockUnit?.declinedBlocks);

    for (const entry of entries.filter((entry) => !entry.required)) {
        const selected = options.chosen
            ? options.chosen.has(entry.key)
            : (!entry.optional && !(keepDeclines && lockDeclined.has(entry.key))) || lockSelected.has(entry.key);
        if (selected) selectedKeys.add(entry.key);
    }
    return toSelections(entries, selectedKeys);
}

/**
 * `update`: lock selections and declines carry over; only new blocks are
 * offered (required ones are added without asking). Non-TTY selects new
 * non-optional blocks and declines new optional ones.
 */
export async function selectUpdateBlocks(
    unitPath: string,
    blockFiles: Map<string, UnitBlockFile>,
    lockUnit: LockUnit | undefined,
): Promise<BlockSelections> {
    const entries = unitBlockEntries(blockFiles);
    const templateKeys = new Set(entries.map((entry) => entry.key));
    const lockSelected = new Set(Object.keys(lockUnit?.blocks ?? {}));
    const lockDeclined = new Set(lockUnit?.declinedBlocks ?? []);

    const selectedKeys = new Set([...lockSelected].filter((key) => templateKeys.has(key)));
    // Required blocks are always selected, even when previously declined.
    for (const entry of entries.filter((entry) => entry.required)) selectedKeys.add(entry.key);
    const newEntries = entries.filter((entry) => !lockSelected.has(entry.key) && !lockDeclined.has(entry.key));

    const newSelectable = newEntries.filter((entry) => !entry.required);
    if (newSelectable.length > 0) {
        if (isInteractive()) {
            const initial = newSelectable.filter((entry) => !entry.optional).map((entry) => entry.key);
            for (const key of await selectBlocks(unitPath, newSelectable, initial)) selectedKeys.add(key);
        } else {
            for (const entry of newSelectable) {
                if (!entry.optional) selectedKeys.add(entry.key);
            }
        }
    }
    return toSelections(entries, selectedKeys);
}
