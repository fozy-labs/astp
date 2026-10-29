import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { assertSafeName, assertSafeRelativePath, nullPrototype } from "./path-safety.js";

export interface LockUnitRef {
    source: string;
    resolvedCommit?: string;
}

export interface LockUnit {
    kind: "file" | "skill";
    version: string;
    hash: string;
    /** External skill source and its locked Git revision. */
    ref?: LockUnitRef;
    /**
     * Block state for units whose template has `<astp-block>` files: key is
     * `<root-relative file target>#<block name>`, value the template block hash.
     * Present iff the unit has at least one file with blocks.
     */
    blocks?: Record<string, string>;
    /** Deselected block keys, like `declined` for units. Present iff `blocks` is. */
    declinedBlocks?: string[];
}

export interface LockRef {
    version: string;
    hash: string;
}

export interface LockBundle {
    source: string;
    resolvedCommit?: string;
    declined: string[];
    units: Record<string, LockUnit>;
    refs?: Record<string, LockRef>;
}

export interface Lock {
    schemaVersion: 1 | 2;
    bundles: Record<string, LockBundle>;
}

export async function readLock(rootDir: string): Promise<Lock> {
    const lockPath = path.resolve(rootDir, "astp.lock");
    let content: string;
    try {
        content = await fs.readFile(lockPath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return { schemaVersion: 2, bundles: nullPrototype() };
        }
        throw error;
    }

    let data: unknown;
    try {
        data = JSON.parse(content);
    } catch (error) {
        throw invalidLock(lockPath, error instanceof Error ? error.message : "invalid JSON");
    }

    if (isRecord(data) && typeof data.schemaVersion === "number" && data.schemaVersion > 2) {
        throw new Error(`Unsupported lock schema version ${data.schemaVersion} in ${lockPath}. Update astp CLI.`);
    }

    try {
        validateLock(data);
    } catch (error) {
        throw invalidLock(lockPath, error instanceof Error ? error.message : String(error));
    }
    for (const bundle of Object.values(data.bundles)) {
        bundle.units = nullPrototype(bundle.units);
        if (bundle.refs) bundle.refs = nullPrototype(bundle.refs);
        for (const unit of Object.values(bundle.units)) if (unit.blocks) unit.blocks = nullPrototype(unit.blocks);
    }
    return { ...data, schemaVersion: 2, bundles: nullPrototype(data.bundles) };
}

export async function writeLock(rootDir: string, lock: Lock): Promise<void> {
    const absoluteRootDir = path.resolve(rootDir);
    const lockPath = path.join(absoluteRootDir, "astp.lock");
    if (Object.keys(lock.bundles).length === 0) {
        await fs.rm(lockPath, { force: true });
        return;
    }

    await fs.mkdir(absoluteRootDir, { recursive: true });
    const bundles = Object.fromEntries(
        Object.keys(lock.bundles)
            .sort()
            .map((bundleName) => {
                const bundle = lock.bundles[bundleName]!;
                const units = Object.fromEntries(
                    Object.keys(bundle.units)
                        .sort()
                        .map((unitPath) => {
                            const unit = bundle.units[unitPath]!;
                            const entry: LockUnit = { hash: unit.hash, kind: unit.kind, version: unit.version };
                            if (unit.ref) {
                                entry.ref = {
                                    source: unit.ref.source,
                                    ...(unit.ref.resolvedCommit ? { resolvedCommit: unit.ref.resolvedCommit } : {}),
                                };
                            }
                            if (unit.blocks || unit.declinedBlocks) {
                                entry.blocks = Object.fromEntries(
                                    Object.keys(unit.blocks ?? {})
                                        .sort()
                                        .map((key) => [key, unit.blocks![key]!]),
                                );
                                entry.declinedBlocks = [...new Set(unit.declinedBlocks ?? [])].sort();
                            }
                            return [unitPath, entry];
                        }),
                );
                const refs = bundle.refs
                    ? Object.fromEntries(
                          Object.keys(bundle.refs)
                              .sort()
                              .map((refPath) => [
                                  refPath,
                                  { hash: bundle.refs![refPath]!.hash, version: bundle.refs![refPath]!.version },
                              ]),
                      )
                    : undefined;
                return [
                    bundleName,
                    {
                        declined: [...new Set(bundle.declined)].sort(),
                        source: bundle.source,
                        ...(bundle.resolvedCommit ? { resolvedCommit: bundle.resolvedCommit } : {}),
                        units,
                        ...(refs ? { refs } : {}),
                    },
                ];
            }),
    );
    const sorted = { bundles, schemaVersion: 2 } as Lock;

    const tempPath = path.join(absoluteRootDir, `astp.lock.tmp-${randomUUID()}`);
    try {
        await fs.writeFile(tempPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
        await fs.rename(tempPath, lockPath);
    } finally {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
}

function validateLock(data: unknown): asserts data is Lock {
    if (!isRecord(data)) throw new Error("expected an object");
    if (data.schemaVersion !== 1 && data.schemaVersion !== 2) throw new Error("schemaVersion must be 1 or 2");
    if (!isRecord(data.bundles)) throw new Error("bundles must be an object");

    for (const [bundleName, value] of Object.entries(data.bundles)) {
        assertSafeName(bundleName, "bundle key");
        if (!isRecord(value)) throw new Error(`bundle '${bundleName}' must be an object`);
        if (typeof value.source !== "string") throw new Error(`bundle '${bundleName}'.source must be a string`);
        if (value.resolvedCommit !== undefined && !isFullCommit(value.resolvedCommit)) {
            throw new Error(`bundle '${bundleName}'.resolvedCommit must be a full commit SHA`);
        }
        if (!Array.isArray(value.declined) || value.declined.some((entry) => typeof entry !== "string")) {
            throw new Error(`bundle '${bundleName}'.declined must be an array of strings`);
        }
        for (const unitPath of value.declined) assertSafeRelativePath(unitPath, `bundle '${bundleName}'.declined`);
        if (!isRecord(value.units)) throw new Error(`bundle '${bundleName}'.units must be an object`);
        for (const [unitPath, unit] of Object.entries(value.units)) {
            assertSafeRelativePath(unitPath, `unit '${bundleName}/${unitPath}'`);
            if (!isRecord(unit)) throw new Error(`unit '${bundleName}/${unitPath}' must be an object`);
            if (unit.kind !== "file" && unit.kind !== "skill") {
                throw new Error(`unit '${bundleName}/${unitPath}'.kind must be 'file' or 'skill'`);
            }
            if (typeof unit.version !== "string") {
                throw new Error(`unit '${bundleName}/${unitPath}'.version must be a string`);
            }
            if (typeof unit.hash !== "string") {
                throw new Error(`unit '${bundleName}/${unitPath}'.hash must be a string`);
            }
            if (unit.ref !== undefined) {
                if (!isRecord(unit.ref) || typeof unit.ref.source !== "string") {
                    throw new Error(`unit '${bundleName}/${unitPath}'.ref.source must be a string`);
                }
                if (unit.ref.resolvedCommit !== undefined && !isFullCommit(unit.ref.resolvedCommit)) {
                    throw new Error(`unit '${bundleName}/${unitPath}'.ref.resolvedCommit must be a full commit SHA`);
                }
            }
            if (unit.blocks !== undefined || unit.declinedBlocks !== undefined) {
                if (!isRecord(unit.blocks)) {
                    throw new Error(`unit '${bundleName}/${unitPath}'.blocks must be an object`);
                }
                if (!Array.isArray(unit.declinedBlocks)) {
                    throw new Error(`unit '${bundleName}/${unitPath}'.declinedBlocks must be an array`);
                }
                for (const [key, hash] of Object.entries(unit.blocks)) {
                    validateBlockKey(key, `unit '${bundleName}/${unitPath}'.blocks`);
                    if (typeof hash !== "string") {
                        throw new Error(`unit '${bundleName}/${unitPath}'.blocks['${key}'] must be a string`);
                    }
                }
                for (const key of unit.declinedBlocks) {
                    if (typeof key !== "string") {
                        throw new Error(`unit '${bundleName}/${unitPath}'.declinedBlocks must be an array of strings`);
                    }
                    validateBlockKey(key, `unit '${bundleName}/${unitPath}'.declinedBlocks`);
                }
            }
        }
        if (value.refs !== undefined) {
            if (!isRecord(value.refs)) throw new Error(`bundle '${bundleName}'.refs must be an object`);
            for (const [refPath, ref] of Object.entries(value.refs)) {
                assertSafeRelativePath(refPath, `ref '${bundleName}/${refPath}'`);
                if (!isRecord(ref)) throw new Error(`ref '${bundleName}/${refPath}' must be an object`);
                if (typeof ref.version !== "string") {
                    throw new Error(`ref '${bundleName}/${refPath}'.version must be a string`);
                }
                if (typeof ref.hash !== "string") {
                    throw new Error(`ref '${bundleName}/${refPath}'.hash must be a string`);
                }
            }
        }
    }
}

const BLOCK_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

function validateBlockKey(key: string, field: string): void {
    const separator = key.lastIndexOf("#");
    if (separator <= 0) throw new Error(`${field} keys must look like '<file>#<name>'`);
    assertSafeRelativePath(key.slice(0, separator), field);
    if (!BLOCK_NAME_REGEX.test(key.slice(separator + 1))) {
        throw new Error(`${field} key '${key}' has an invalid block name`);
    }
}

function isFullCommit(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidLock(lockPath: string, reason: string): Error {
    return new Error(`Invalid lock file ${lockPath}: ${reason}. Fix it or delete it and reinstall.`);
}
