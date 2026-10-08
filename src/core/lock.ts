import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface LockUnit {
    kind: "file" | "skill";
    version: string;
    hash: string;
    /**
     * Block state for units whose template has `<astp-block>` files: key is
     * `<root-relative file target>#<block name>`, value the template block hash.
     * Present iff the unit has at least one file with blocks.
     */
    blocks?: Record<string, string>;
    /** Deselected block keys, like `declined` for units. Present iff `blocks` is. */
    declinedBlocks?: string[];
}

export interface LockBundle {
    source: string;
    declined: string[];
    units: Record<string, LockUnit>;
}

export interface Lock {
    schemaVersion: 1;
    bundles: Record<string, LockBundle>;
}

export async function readLock(rootDir: string): Promise<Lock> {
    const lockPath = path.resolve(rootDir, "astp.lock");
    let content: string;
    try {
        content = await fs.readFile(lockPath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return { schemaVersion: 1, bundles: Object.create(null) as Record<string, LockBundle> };
        }
        throw error;
    }

    let data: unknown;
    try {
        data = JSON.parse(content);
    } catch (error) {
        throw invalidLock(lockPath, error instanceof Error ? error.message : "invalid JSON");
    }

    if (isRecord(data) && typeof data.schemaVersion === "number" && data.schemaVersion > 1) {
        throw new Error(`Unsupported lock schema version ${data.schemaVersion} in ${lockPath}. Update astp CLI.`);
    }

    try {
        validateLock(data);
    } catch (error) {
        throw invalidLock(lockPath, error instanceof Error ? error.message : String(error));
    }
    return data;
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
                return [
                    bundleName,
                    {
                        declined: [...new Set(bundle.declined)].sort(),
                        source: bundle.source,
                        units,
                    },
                ];
            }),
    );
    const sorted = { bundles, schemaVersion: 1 } as Lock;

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
    if (data.schemaVersion !== 1) throw new Error("schemaVersion must be 1");
    if (!isRecord(data.bundles)) throw new Error("bundles must be an object");

    for (const [bundleName, value] of Object.entries(data.bundles)) {
        if (!isRecord(value)) throw new Error(`bundle '${bundleName}' must be an object`);
        if (typeof value.source !== "string") throw new Error(`bundle '${bundleName}'.source must be a string`);
        if (!Array.isArray(value.declined) || value.declined.some((entry) => typeof entry !== "string")) {
            throw new Error(`bundle '${bundleName}'.declined must be an array of strings`);
        }
        for (const unitPath of value.declined) validateUnitPath(unitPath, `bundle '${bundleName}'.declined`);
        if (!isRecord(value.units)) throw new Error(`bundle '${bundleName}'.units must be an object`);
        for (const [unitPath, unit] of Object.entries(value.units)) {
            validateUnitPath(unitPath, `unit '${bundleName}/${unitPath}'`);
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
    }
}

function validateUnitPath(unitPath: string, field: string): void {
    if (
        unitPath.length === 0 ||
        path.isAbsolute(unitPath) ||
        path.posix.isAbsolute(unitPath) ||
        path.win32.isAbsolute(unitPath) ||
        unitPath.split(/[/\\]/).some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
        throw new Error(`${field} must be a safe relative path`);
    }
}

const BLOCK_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

function validateBlockKey(key: string, field: string): void {
    const separator = key.lastIndexOf("#");
    if (separator <= 0) throw new Error(`${field} keys must look like '<file>#<name>'`);
    validateUnitPath(key.slice(0, separator), field);
    if (!BLOCK_NAME_REGEX.test(key.slice(separator + 1))) {
        throw new Error(`${field} key '${key}' has an invalid block name`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidLock(lockPath: string, reason: string): Error {
    return new Error(`Invalid lock file ${lockPath}: ${reason}. Fix it or delete it and reinstall.`);
}
