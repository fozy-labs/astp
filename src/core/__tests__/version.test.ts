import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InstalledBundle, Manifest } from "@/types/index.js";

import { computeHash, injectAstpFields } from "../frontmatter.js";
import { compareVersions, detectModified, scanInstalled } from "../version.js";

describe("compareVersions", () => {
    const createManifest = (bundleVersion: string): Manifest => ({
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            rdpi: {
                name: "rdpi",
                version: bundleVersion,
                description: "RDPI",
                default: false,
                items: [{ source: "rdpi/agents/a.md", target: "agents/a.md", category: "agent" }],
            },
        },
    });

    const createInstalled = (version: string): InstalledBundle[] => [
        {
            bundleName: "rdpi",
            version,
            files: [
                {
                    filePath: "/root/agents/a.md",
                    relativePath: "agents/a.md",
                    metadata: {
                        source: "fozy-labs/astp",
                        bundle: "rdpi",
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
                base: {
                    name: "base",
                    version: "1.0.0",
                    description: "Base",
                    default: true,
                    items: [],
                },
            },
        };

        const report = compareVersions(createInstalled("1.0.0"), manifest);
        expect(report.notInManifest).toHaveLength(1);
        expect(report.notInManifest[0].bundleName).toBe("rdpi");
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
astp-bundle: rdpi
astp-version: 1.0.0
astp-hash: abc123
---
Content 1`;

        const managed2 = `---
astp-source: fozy-labs/astp
astp-bundle: rdpi
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
        expect(result[0].bundleName).toBe("rdpi");
        expect(result[0].files).toHaveLength(2);
    });

    // T27: Update detection with mixed file states
    it("T27: update detection with mixed file states", async () => {
        const managedContent = `---
astp-source: fozy-labs/astp
astp-bundle: rdpi
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
                rdpi: {
                    name: "rdpi",
                    version: "2.0.0",
                    description: "RDPI",
                    default: false,
                    items: [
                        {
                            source: "rdpi/agents/a.md",
                            target: "agents/a.md",
                            category: "agent",
                        },
                        {
                            source: "rdpi/agents/new.md",
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
