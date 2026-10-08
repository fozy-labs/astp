import type { BlockSelections, LockUnit, UnitBlockFile } from "@/core/index.js";
import type { BlockOption } from "@/ui/prompts.js";
import { isInteractive, selectBlocks } from "@/ui/prompts.js";

interface BlockEntry extends BlockOption {
    optional: boolean;
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
 * `install`: required blocks are always selected and never shown; the wizard
 * pre-checks lock selections plus new non-optional blocks (a unit without lock
 * blocks starts with all non-optional). Non-TTY installs all non-optional
 * blocks plus optional ones already in the lock.
 */
export async function selectInstallBlocks(
    unitPath: string,
    blockFiles: Map<string, UnitBlockFile>,
    lockUnit: LockUnit | undefined,
): Promise<BlockSelections> {
    const entries = unitBlockEntries(blockFiles);
    const selectable = entries.filter((entry) => !entry.required);
    const selectedKeys = new Set(entries.filter((entry) => entry.required).map((entry) => entry.key));
    const lockSelected = new Set(Object.keys(lockUnit?.blocks ?? {}));
    const lockDeclined = new Set(lockUnit?.declinedBlocks ?? []);

    if (selectable.length > 0) {
        if (isInteractive()) {
            const templateKeys = new Set(selectable.map((entry) => entry.key));
            const initial =
                lockUnit?.blocks || lockUnit?.declinedBlocks
                    ? selectable
                          .filter(
                              (entry) =>
                                  lockSelected.has(entry.key) || (!lockDeclined.has(entry.key) && !entry.optional),
                          )
                          .map((entry) => entry.key)
                    : selectable.filter((entry) => !entry.optional).map((entry) => entry.key);
            for (const key of await selectBlocks(
                unitPath,
                selectable,
                initial.filter((key) => templateKeys.has(key)),
            )) {
                selectedKeys.add(key);
            }
        } else {
            for (const entry of selectable) {
                if (!entry.optional || lockSelected.has(entry.key)) selectedKeys.add(entry.key);
            }
        }
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
    const newEntries = entries.filter((entry) => !lockSelected.has(entry.key) && !lockDeclined.has(entry.key));
    for (const entry of newEntries.filter((entry) => entry.required)) selectedKeys.add(entry.key);

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
