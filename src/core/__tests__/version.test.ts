import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InstalledBundle, Manifest } from "@/types/index.js";

import { computeHash, injectAstpFields } from "../frontmatter.js";
import { compareVersions, detectModified, removeBundle, scanInstalled } from "../version.js";

describe("compareVersions", () => {
    const createManifest = (bundleVersion: string): Manifest => ({
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            pipeline: {
                name: "pipeline",
                version: bundleVersion,
                description: "Pipeline",
                default: false,
                items: [{ source: "pipeline/agents/a.md", target: "agents/a.md", category: "agent" }],
            },
        },
    });

    const createInstalled = (version: string): InstalledBundle[] => [
        {
            bundleName: "pipeline",
            version,
            files: [
                {
                    filePath: "/root/agents/a.md",
                    relativePath: "agents/a.md",
                    metadata: {
                        source: "fozy-labs/astp",
                        bundle: "pipeline",
                        version,
                        hash: "abc",
                    },
                },
            ],
        },
    ];

    // T08: Update available
    it("T08: detects update when manifest version is newer", () => {
        const report = compareVersions(createInstalled("1.0.0"), createManifest("1.2.0"));
        expect(report.updates).toHaveLength(1);
        expect(report.updates[0].installedVersion).toBe("1.0.0");
        expect(report.updates[0].availableVersion).toBe("1.2.0");
    });

    // T09: Same version
    it("T09: reports up to date when versions match", () => {
        const report = compareVersions(createInstalled("1.0.0"), createManifest("1.0.0"));
        expect(report.upToDate).toHaveLength(1);
        expect(report.updates).toHaveLength(0);
    });

    // T10: Installed newer (no downgrade)
    it("T10: reports up to date when installed is newer (no downgrade)", () => {
        const report = compareVersions(createInstalled("2.0.0"), createManifest("1.0.0"));
        expect(report.upToDate).toHaveLength(1);
        expect(report.updates).toHaveLength(0);
    });

    // T11: Invalid semver
    it("T11: handles invalid semver gracefully", () => {
        const report = compareVersions(createInstalled("not-a-version"), createManifest("1.0.0"));
        expect(report.updates).toHaveLength(1);
    });

    it("classifies bundles not in manifest as notInManifest", () => {
        const manifest: Manifest = {
            schemaVersion: 1,
            repository: "fozy-labs/astp",
            bundles: {
                core: {
                    name: "core",
                    version: "1.0.0",
                    description: "Core",
                    default: true,
                    items: [],
                },
            },
        };

        const report = compareVersions(createInstalled("1.0.0"), manifest);
        expect(report.notInManifest).toHaveLength(1);
        expect(report.notInManifest[0].bundleName).toBe("pipeline");
    });
});

describe("detectModified", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-detect-"));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    // T20: Hash matches → unmodified
    it("T20: returns unmodified when hash matches", async () => {
        const original = `---
name: test
---
Body`;
        const hash = computeHash(original);
        const content = injectAstpFields(
            original,
            { source: "fozy-labs/astp", bundle: "test", version: "1.0.0" },
            hash,
        );

        const filePath = path.join(tempDir, "agent.md");
        await fs.writeFile(filePath, content);

        const bundle: InstalledBundle = {
            bundleName: "test",
            version: "1.0.0",
            files: [
                {
                    filePath,
                    relativePath: "agent.md",
                    metadata: {
                        source: "fozy-labs/astp",
                        bundle: "test",
                        version: "1.0.0",
                        hash,
                    },
                },
            ],
        };

        const result = await detectModified(bundle, tempDir);
        expect(result[0].state).toBe("unmodified");
    });

    // T21: Hash mismatch → modified
    it("T21: returns modified when hash differs", async () => {
        const original = `---
name: test
---
Body`;
        const hash = computeHash(original);
        let content = injectAstpFields(original, { source: "fozy-labs/astp", bundle: "test", version: "1.0.0" }, hash);
        content += "\n<!-- user edit -->";

        const filePath = path.join(tempDir, "agent.md");
        await fs.writeFile(filePath, content);

        const bundle: InstalledBundle = {
            bundleName: "test",
            version: "1.0.0",
            files: [
                {
                    filePath,
                    relativePath: "agent.md",
                    metadata: {
                        source: "fozy-labs/astp",
                        bundle: "test",
                        version: "1.0.0",
                        hash,
                    },
                },
            ],
        };

        const result = await detectModified(bundle, tempDir);
        expect(result[0].state).toBe("modified");
    });

    // T22: Missing astp-hash → treated as modified
    it("T22: treats missing astp-hash as modified", async () => {
        const original = `---
name: test
---
Body`;
        const content = injectAstpFields(
            original,
            { source: "fozy-labs/astp", bundle: "test", version: "1.0.0" },
            "somehash",
        );

        const filePath = path.join(tempDir, "agent.md");
        await fs.writeFile(filePath, content);

        const bundle: InstalledBundle = {
            bundleName: "test",
            version: "1.0.0",
            files: [
                {
                    filePath,
                    relativePath: "agent.md",
                    metadata: {
                        source: "fozy-labs/astp",
                        bundle: "test",
                        version: "1.0.0",
                        hash: "",
                    },
                },
            ],
        };

        const result = await detectModified(bundle, tempDir);
        expect(result[0].state).toBe("modified");
    });

    it("reports unmodified for an untouched .sh and modified after appending a line", async () => {
        const original = "#!/usr/bin/env bash\necho hi\n";
        const hash = computeHash(original);
        const content = injectAstpFields(
            original,
            { source: "fozy-labs/astp", bundle: "matt", version: "1.0.0" },
            hash,
            "hash-comment",
        );

        const filePath = path.join(tempDir, "run.sh");
        await fs.writeFile(filePath, content);

        const makeBundle = (): InstalledBundle => ({
            bundleName: "matt",
            version: "1.0.0",
            files: [
                {
                    filePath,
                    relativePath: "run.sh",
                    metadata: {
                        source: "fozy-labs/astp",
                        bundle: "matt",
                        version: "1.0.0",
                        hash,
                    },
                },
            ],
        });

        expect((await detectModified(makeBundle(), tempDir))[0].state).toBe("unmodified");

        await fs.appendFile(filePath, "echo more\n");
        expect((await detectModified(makeBundle(), tempDir))[0].state).toBe("modified");
    });
});

describe("removeBundle", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-remove-"));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("removes a .sh file carrying the hash-comment block", async () => {
        const original = "#!/usr/bin/env bash\necho hi\n";
        const hash = computeHash(original);
        const content = injectAstpFields(
            original,
            { source: "fozy-labs/astp", bundle: "matt", version: "1.0.0" },
            hash,
            "hash-comment",
        );

        await fs.mkdir(path.join(tempDir, "scripts"), { recursive: true });
        const filePath = path.join(tempDir, "scripts", "run.sh");
        await fs.writeFile(filePath, content);

        const bundle: InstalledBundle = {
            bundleName: "matt",
            version: "1.0.0",
            files: [
                {
                    filePath,
                    relativePath: "scripts/run.sh",
                    metadata: {
                        source: "fozy-labs/astp",
                        bundle: "matt",
                        version: "1.0.0",
                        hash,
                    },
                },
            ],
        };

        const result = await removeBundle(bundle, tempDir);
        expect(result.removed).toEqual(["scripts/run.sh"]);
        await expect(fs.access(filePath)).rejects.toThrow();
        await expect(fs.access(path.join(tempDir, "scripts"))).rejects.toThrow();
    });
});

describe("scanInstalled", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-scan-"));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    // T26: Scan returns only astp-managed files
    it("T26: scans directory and returns only astp-managed files", async () => {
        const managed1 = `---
name: agent1
astp-source: fozy-labs/astp
astp-bundle: pipeline
astp-version: 1.0.0
astp-hash: abc123
---
Content 1`;

        const managed2 = `---
astp-source: fozy-labs/astp
astp-bundle: pipeline
astp-version: 1.0.0
astp-hash: def456
---
Content 2`;

        const unmanaged = `---
name: custom-agent
---
My custom content`;

        await fs.mkdir(path.join(tempDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "agents", "managed1.md"), managed1);
        await fs.writeFile(path.join(tempDir, "agents", "managed2.md"), managed2);
        await fs.writeFile(path.join(tempDir, "agents", "custom.md"), unmanaged);

        const result = await scanInstalled(tempDir);
        expect(result).toHaveLength(1);
        expect(result[0].bundleName).toBe("pipeline");
        expect(result[0].files).toHaveLength(2);
    });

    it("finds a .sh carrying the hash-comment block and groups it with the bundle's .md files", async () => {
        const script = `#!/usr/bin/env bash
# astp-source: fozy-labs/astp
# astp-bundle: matt
# astp-version: 1.0.0
# astp-hash: abc123
echo hi
`;
        const md = `---
astp-source: fozy-labs/astp
astp-bundle: matt
astp-version: 1.0.0
astp-hash: def456
---
Doc`;

        await fs.mkdir(path.join(tempDir, "skills", "wizard"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "skills", "wizard", "template.sh"), script);
        await fs.writeFile(path.join(tempDir, "skills", "wizard", "SKILL.md"), md);
        await fs.writeFile(path.join(tempDir, "skills", "wizard", "notes.json"), "{}");

        const result = await scanInstalled(tempDir);
        expect(result).toHaveLength(1);
        expect(result[0].bundleName).toBe("matt");
        expect(result[0].files.map((f) => f.relativePath).sort()).toEqual([
            "skills/wizard/SKILL.md",
            "skills/wizard/template.sh",
        ]);
    });

    // T27: Update detection with mixed file states
    it("T27: update detection with mixed file states", async () => {
        const managedContent = `---
astp-source: fozy-labs/astp
astp-bundle: pipeline
astp-version: 1.0.0
astp-hash: somehash
---
Content`;

        await fs.mkdir(path.join(tempDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "agents", "a.md"), managedContent);

        const installed = await scanInstalled(tempDir);

        const manifest: Manifest = {
            schemaVersion: 1,
            repository: "fozy-labs/astp",
            bundles: {
                pipeline: {
                    name: "pipeline",
                    version: "2.0.0",
                    description: "Pipeline",
                    default: false,
                    items: [
                        {
                            source: "pipeline/agents/a.md",
                            target: "agents/a.md",
                            category: "agent",
                        },
                        {
                            source: "pipeline/agents/new.md",
                            target: "agents/new.md",
                            category: "agent",
                        },
                    ],
                },
            },
        };

        const report = compareVersions(installed, manifest);
        expect(report.updates).toHaveLength(1);
        expect(report.updates[0].availableVersion).toBe("2.0.0");

        const files = report.updates[0].files;
        expect(files.find((f) => f.targetPath === "agents/a.md")?.state).toBe("unmodified");
        expect(files.find((f) => f.targetPath === "agents/new.md")?.state).toBe("new");
    });
});
