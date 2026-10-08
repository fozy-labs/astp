import { computeHash, extractAstpMetadata, readDescription, stripAstpFields } from "../frontmatter.js";

describe("extractAstpMetadata", () => {
    // T01: Parse frontmatter with existing fields + astp fields
    it("T01: extracts InstalledFileMetadata from frontmatter with existing + astp fields", () => {
        const content = `---
name: pipeline-approve
description: "ONLY for pipeline."
astp-source: fozy-labs/astp
astp-bundle: pipeline
astp-version: 1.0.0
astp-hash: abc123def456
---
Content here`;

        const result = extractAstpMetadata(content);
        expect(result).toEqual({
            source: "fozy-labs/astp",
            bundle: "pipeline",
            version: "1.0.0",
            hash: "abc123def456",
        });
    });

    // T02: Parse file with no frontmatter — return null
    it("T02: returns null for file with no frontmatter", () => {
        const content = "# Title\ncontent";
        expect(extractAstpMetadata(content)).toBeNull();
    });

    it("returns null for frontmatter without astp-source", () => {
        const content = `---
name: foo
description: bar
---
Body`;
        expect(extractAstpMetadata(content)).toBeNull();
    });
});

describe("stripAstpFields", () => {
    // T05: Strip astp fields, preserve other fields
    it("T05: removes only astp fields from mixed frontmatter", () => {
        const content = `---
name: pipeline-approve
astp-source: fozy-labs/astp
astp-bundle: pipeline
astp-version: 1.0.0
astp-hash: abc123
---
Body`;

        const result = stripAstpFields(content);

        expect(result).toBe(`---
name: pipeline-approve
---
Body`);
    });

    // T06: Strip astp fields from astp-only frontmatter — remove entire block
    it("T06: removes entire frontmatter block when only astp fields existed", () => {
        const content = `---
astp-source: fozy-labs/astp
astp-bundle: pipeline
astp-version: 1.0.0
astp-hash: abc123
---
# Title`;

        const result = stripAstpFields(content);
        expect(result).toBe("# Title");
    });

    it("returns content unchanged when no frontmatter exists", () => {
        const content = "# No frontmatter\nJust content";
        expect(stripAstpFields(content)).toBe(content);
    });
});

describe("computeHash", () => {
    // T07: SHA-256 deterministic
    it("T07: computes deterministic SHA-256 hex digest", () => {
        const hash1 = computeHash("hello world");
        const hash2 = computeHash("hello world");
        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    // T07: CRLF/LF normalization
    it("T07: produces same hash for LF and CRLF content", () => {
        const hashLF = computeHash("line 1\nline 2\n");
        const hashCRLF = computeHash("line 1\r\nline 2\r\n");
        expect(hashLF).toBe(hashCRLF);
    });
});

describe("readDescription", () => {
    it.each([
        ["description: plain value", "plain value"],
        ['description: "quoted value"', "quoted value"],
        ["description: 'single quoted'", "single quoted"],
        ["description: >-\n  first line\n  second line\nname: test", "first line second line"],
        ["description: |\n  first line\n  second line\nname: test", "first line second line"],
    ])("reads %s", (field, expected) => {
        expect(readDescription(`---\n${field}\n---\n`)).toBe(expected);
    });

    it("returns null when description is absent", () => {
        expect(readDescription("---\nname: test\n---\n")).toBeNull();
    });
});
