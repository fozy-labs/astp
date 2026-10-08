import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readLock, writeLock } from "../lock.js";

describe("lock file", () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-lock-"));
    });

    afterEach(async () => {
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    it("returns an empty lock when missing and round-trips valid state", async () => {
        await expect(readLock(rootDir)).resolves.toEqual({ schemaVersion: 1, bundles: {} });
        const lock = {
            schemaVersion: 1 as const,
            bundles: {
                core: {
                    source: "fozy-labs/astp",
                    declined: ["skills/b", "skills/a"],
                    units: { "skills/a": { kind: "skill" as const, version: "1.0.0", hash: "abc" } },
                },
            },
        };
        await writeLock(rootDir, lock);
        await expect(readLock(rootDir)).resolves.toEqual({
            schemaVersion: 1,
            bundles: {
                core: {
                    source: "fozy-labs/astp",
                    declined: ["skills/a", "skills/b"],
                    units: { "skills/a": { kind: "skill", version: "1.0.0", hash: "abc" } },
                },
            },
        });
    });

    it("rejects malformed JSON and invalid field types with the absolute path", async () => {
        const lockPath = path.join(rootDir, "astp.lock");
        await fs.writeFile(lockPath, "{");
        await expect(readLock(rootDir)).rejects.toThrow(`Invalid lock file ${lockPath}:`);
        await fs.writeFile(lockPath, JSON.stringify({ schemaVersion: 1, bundles: { core: { source: 1 } } }));
        await expect(readLock(rootDir)).rejects.toThrow("bundle 'core'.source must be a string");
    });

    it("rejects unsafe unit paths", async () => {
        const lockPath = path.join(rootDir, "astp.lock");
        await fs.writeFile(
            lockPath,
            JSON.stringify({
                schemaVersion: 1,
                bundles: {
                    core: {
                        source: "repo",
                        declined: [],
                        units: { "../../outside": { kind: "file", version: "1.0.0", hash: "abc" } },
                    },
                },
            }),
        );
        await expect(readLock(rootDir)).rejects.toThrow("safe relative path");
    });

    it("rejects unknown schema versions", async () => {
        const lockPath = path.join(rootDir, "astp.lock");
        await fs.writeFile(lockPath, JSON.stringify({ schemaVersion: 2, bundles: {} }));
        await expect(readLock(rootDir)).rejects.toThrow(
            `Unsupported lock schema version 2 in ${lockPath}. Update astp CLI.`,
        );
    });

    it("writes stable sorted output, removes its temporary file, and removes an empty lock", async () => {
        await writeLock(rootDir, {
            schemaVersion: 1,
            bundles: {
                z: {
                    source: "repo",
                    declined: ["z", "a", "a"],
                    units: {
                        z: { kind: "file", version: "1.0.0", hash: "z" },
                        a: { kind: "skill", version: "1.0.0", hash: "a" },
                    },
                },
                a: { source: "repo", declined: [], units: {} },
            },
        });
        const contents = await fs.readFile(path.join(rootDir, "astp.lock"), "utf8");
        expect(contents.indexOf('"bundles"')).toBeLessThan(contents.indexOf('"schemaVersion"'));
        expect(contents.indexOf('"a"')).toBeLessThan(contents.indexOf('"z"'));
        expect(contents.indexOf('"hash"')).toBeLessThan(contents.indexOf('"kind"'));
        expect(contents.indexOf('"kind"')).toBeLessThan(contents.indexOf('"version"'));
        expect(contents).toContain('"declined": [\n        "a",\n        "z"\n      ]');
        expect((await fs.readdir(rootDir)).filter((name) => name.startsWith("astp.lock.tmp-"))).toEqual([]);

        await writeLock(rootDir, { schemaVersion: 1, bundles: {} });
        await expect(fs.access(path.join(rootDir, "astp.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    });
});
