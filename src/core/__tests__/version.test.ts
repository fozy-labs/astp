import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { computeHash } from "../frontmatter.js";
import { writeLock } from "../lock.js";
import { computeSkillTreeHash } from "../skill-tree.js";
import { loadInstalled } from "../version.js";

describe("loadInstalled", () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-installed-"));
    });

    afterEach(async () => {
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    it("reports lock units as unmodified, modified, missing, and kind-mismatched", async () => {
        await fs.mkdir(path.join(rootDir, "skills/sample"), { recursive: true });
        await fs.mkdir(path.join(rootDir, "as-dir"));
        await fs.writeFile(path.join(rootDir, "skills/sample/SKILL.md"), "# Sample\n");
        await fs.writeFile(path.join(rootDir, "changed.md"), "edited");
        await writeLock(rootDir, {
            schemaVersion: 1,
            bundles: {
                core: {
                    source: "repo",
                    declined: [],
                    units: {
                        "skills/sample": {
                            kind: "skill",
                            version: "1.0.0",
                            hash: await computeSkillTreeHash(path.join(rootDir, "skills/sample")),
                        },
                        "changed.md": { kind: "file", version: "1.0.0", hash: "wrong" },
                        "missing.md": { kind: "file", version: "1.0.0", hash: "gone" },
                        "as-dir": { kind: "file", version: "1.0.0", hash: "wrong" },
                    },
                },
            },
        });

        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ relativePath: "skills/sample", state: "unmodified" }),
                expect.objectContaining({ relativePath: "changed.md", state: "modified" }),
                expect.objectContaining({ relativePath: "missing.md", state: "missing" }),
                expect.objectContaining({ relativePath: "as-dir", state: "modified" }),
            ]),
        );
    });

    it("finds clean and modified legacy file units", async () => {
        const cleanContent = "---\nname: clean\n---\n# clean\n";
        const clean = `---\nname: clean\nastp-source: repo\nastp-bundle: core\nastp-version: 0.3.1\nastp-hash: ${computeHash(cleanContent)}\n---\n# clean\n`;
        await fs.writeFile(path.join(rootDir, "clean.md"), clean);
        await fs.writeFile(path.join(rootDir, "changed.md"), clean.replaceAll("clean", "changed") + "\nlocal edit");
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ relativePath: "clean.md", origin: "legacy", state: "unmodified" }),
                expect.objectContaining({ relativePath: "changed.md", origin: "legacy", state: "modified" }),
            ]),
        );
    });

    it("detects clean legacy skills in the per-file and root-tree formats", async () => {
        const v031 = path.join(rootDir, "skills", "v031");
        await fs.mkdir(v031, { recursive: true });
        const addLegacyFields = (content: string, version: string) => {
            const hash = computeHash(content);
            return `---\nastp-source: repo\nastp-bundle: core\nastp-version: ${version}\nastp-hash: ${hash}\n---\n${content}`;
        };
        const v031Root = "# v031 skill\n";
        const v031Reference = "# reference\n";
        await fs.writeFile(path.join(v031, "SKILL.md"), addLegacyFields(v031Root, "0.3.1"));
        await fs.writeFile(path.join(v031, "reference.md"), addLegacyFields(v031Reference, "0.3.1"));

        const issue8 = path.join(rootDir, "skills", "issue8");
        await fs.mkdir(issue8, { recursive: true });
        const issue8Root = "---\nname: issue8\n---\n# issue8\n";
        await fs.writeFile(path.join(issue8, "SKILL.md"), issue8Root);
        const treeHash = await computeSkillTreeHash(issue8);
        await fs.writeFile(
            path.join(issue8, "SKILL.md"),
            `---\nname: issue8\nastp-source: repo\nastp-bundle: core\nastp-version: 0.4.0\nastp-hash: ${treeHash}\n---\n# issue8\n`,
        );

        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ relativePath: "skills/v031", kind: "skill", state: "unmodified" }),
                expect.objectContaining({ relativePath: "skills/issue8", kind: "skill", state: "unmodified" }),
            ]),
        );
    });

    it("marks modified legacy skills as modified", async () => {
        const skillDir = path.join(rootDir, "skills", "sample");
        await fs.mkdir(skillDir, { recursive: true });
        const content = "# sample\n";
        await fs.writeFile(
            path.join(skillDir, "SKILL.md"),
            `---\nastp-source: repo\nastp-bundle: core\nastp-version: 0.3.1\nastp-hash: ${computeHash(content)}\n---\n${content}`,
        );
        await fs.writeFile(
            path.join(skillDir, "reference.md"),
            `---\nastp-source: repo\nastp-bundle: core\nastp-version: 0.3.1\nastp-hash: ${computeHash("# original\n")}\n---\n# edited\n`,
        );
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toContainEqual(
            expect.objectContaining({ relativePath: "skills/sample", kind: "skill", state: "modified" }),
        );
    });
});
