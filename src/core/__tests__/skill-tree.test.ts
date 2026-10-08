import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { computeSkillTreeHash, computeTemplateUnitHash } from "../skill-tree.js";

describe("computeSkillTreeHash", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-skill-tree-"));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("is deterministic and independent of directory entry order", async () => {
        const first = path.join(tempDir, "first");
        const second = path.join(tempDir, "second");
        await fs.mkdir(path.join(first, "references", "nested"), { recursive: true });
        await fs.mkdir(path.join(second, "references", "nested"), { recursive: true });

        await fs.writeFile(path.join(first, "SKILL.md"), "# Skill\n");
        await fs.writeFile(path.join(first, "references", "nested", "example.md"), "Nested\n");
        await fs.writeFile(path.join(first, "asset.bin"), Buffer.from([0, 255, 1]));
        await fs.writeFile(path.join(second, "asset.bin"), Buffer.from([0, 255, 1]));
        await fs.writeFile(path.join(second, "references", "nested", "example.md"), "Nested\n");
        await fs.writeFile(path.join(second, "SKILL.md"), "# Skill\n");

        const firstHash = await computeSkillTreeHash(first);
        expect(await computeSkillTreeHash(first)).toBe(firstHash);
        expect(await computeSkillTreeHash(second)).toBe(firstHash);
    });

    it.each(["edit", "add", "delete", "rename"])("changes when a skill file is %s", async (change) => {
        await fs.mkdir(path.join(tempDir, "references"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "SKILL.md"), "# Skill\n");
        await fs.writeFile(path.join(tempDir, "references", "example.md"), "Original\n");
        const initialHash = await computeSkillTreeHash(tempDir);

        if (change === "edit") {
            await fs.writeFile(path.join(tempDir, "references", "example.md"), "Edited\n");
        } else if (change === "add") {
            await fs.writeFile(path.join(tempDir, "references", "new.md"), "New\n");
        } else if (change === "delete") {
            await fs.rm(path.join(tempDir, "references", "example.md"));
        } else {
            await fs.rename(
                path.join(tempDir, "references", "example.md"),
                path.join(tempDir, "references", "renamed.md"),
            );
        }

        expect(await computeSkillTreeHash(tempDir)).not.toBe(initialHash);
    });

    it("hashes root metadata by default and strips it only when requested", async () => {
        const source = await fs.mkdtemp(path.join(os.tmpdir(), "astp-skill-source-"));
        const installed = await fs.mkdtemp(path.join(os.tmpdir(), "astp-skill-installed-"));
        try {
            await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: sample\n---\nSkill\n");
            await fs.writeFile(path.join(source, "references.md"), "line 1\nline 2\n");
            await fs.writeFile(
                path.join(installed, "SKILL.md"),
                "---\nname: sample\nastp-source: fozy-labs/astp\nastp-bundle: sample\nastp-version: 1.0.0\nastp-hash: ignored\n---\nSkill\n",
            );
            await fs.writeFile(path.join(installed, "references.md"), "line 1\r\nline 2\r\n");

            expect(await computeSkillTreeHash(installed)).not.toBe(await computeSkillTreeHash(source));
            expect(await computeSkillTreeHash(installed, { stripRootAstpFields: true })).toBe(
                await computeSkillTreeHash(source),
            );
        } finally {
            await fs.rm(source, { recursive: true, force: true });
            await fs.rm(installed, { recursive: true, force: true });
        }
    });

    it("matches the template-unit hash to the installed skill tree hash", async () => {
        const template = path.join(tempDir, "template");
        const installed = path.join(tempDir, "installed");
        await fs.mkdir(path.join(template, "skills", "sample"), { recursive: true });
        await fs.mkdir(path.join(installed, "skills", "sample"), { recursive: true });
        await fs.writeFile(path.join(template, "skills", "sample", "SKILL.md"), "# Sample\n");
        await fs.writeFile(path.join(template, "skills", "sample", "asset.bin"), Buffer.from([0, 255]));
        await fs.cp(path.join(template, "skills", "sample"), path.join(installed, "skills", "sample"), {
            recursive: true,
        });
        const unit = {
            kind: "skill" as const,
            relativePath: "skills/sample",
            items: [
                {
                    source: "bundle/skills/sample/SKILL.md",
                    target: "skills/sample/SKILL.md",
                    category: "skill" as const,
                },
                {
                    source: "bundle/skills/sample/asset.bin",
                    target: "skills/sample/asset.bin",
                    category: "skill" as const,
                },
            ],
        };
        expect(await computeTemplateUnitHash(template, unit)).toBe(
            await computeSkillTreeHash(path.join(installed, "skills", "sample")),
        );
    });

    it("hashes astp metadata in a nested SKILL.md as ordinary file content", async () => {
        const plain = await fs.mkdtemp(path.join(os.tmpdir(), "astp-nested-skill-plain-"));
        const tagged = await fs.mkdtemp(path.join(os.tmpdir(), "astp-nested-skill-tagged-"));
        try {
            const nestedPath = path.join("examples", "sub", "SKILL.md");
            await fs.mkdir(path.join(plain, "examples", "sub"), { recursive: true });
            await fs.mkdir(path.join(tagged, "examples", "sub"), { recursive: true });
            await fs.writeFile(path.join(plain, "SKILL.md"), "# Outer skill\n");
            await fs.writeFile(path.join(tagged, "SKILL.md"), "# Outer skill\n");
            await fs.writeFile(path.join(plain, nestedPath), "---\nname: nested\n---\nNested skill\n");
            await fs.writeFile(
                path.join(tagged, nestedPath),
                "---\nname: nested\nastp-source: fozy-labs/astp\n---\nNested skill\n",
            );

            expect(await computeSkillTreeHash(plain)).not.toBe(await computeSkillTreeHash(tagged));
        } finally {
            await fs.rm(plain, { recursive: true, force: true });
            await fs.rm(tagged, { recursive: true, force: true });
        }
    });

    it("ignores symbolic links", async () => {
        const skillDir = path.join(tempDir, "skill");
        const linkedFile = path.join(tempDir, "linked.bin");
        await fs.mkdir(skillDir);
        await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Skill\n");
        await fs.writeFile(linkedFile, Buffer.from([0, 1]));
        await fs.symlink(linkedFile, path.join(skillDir, "linked.bin"));

        const initialHash = await computeSkillTreeHash(skillDir);
        await fs.writeFile(linkedFile, Buffer.from([0, 2]));

        expect(await computeSkillTreeHash(skillDir)).toBe(initialHash);
    });
});
