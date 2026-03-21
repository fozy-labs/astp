import { computeHash, extractAstpMetadata, injectAstpFields, stripAstpFields } from "../frontmatter.js";

describe("extractAstpMetadata", () => {
    // T01: Parse frontmatter with existing fields + astp fields
    it("T01: extracts InstalledFileMetadata from frontmatter with existing + astp fields", () => {
        const content = `---
name: rdpi-approve
description: "ONLY for RDPI pipeline."
astp-source: fozy-labs/astp
astp-bundle: rdpi
astp-version: 1.0.0
astp-hash: abc123def456
---
Content here`;

        const result = extractAstpMetadata(content);
        expect(result).toEqual({
            source: "fozy-labs/astp",
            bundle: "rdpi",
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

describe("injectAstpFields", () => {
    const meta = { source: "fozy-labs/astp", bundle: "rdpi", version: "1.0.0" };
    const hash = "hashvalue";

    // T03: Inject into existing frontmatter
    it("T03: appends astp fields to existing frontmatter, preserving existing fields", () => {
        const content = `---
name: rdpi-approve
---
Content`;

        const result = injectAstpFields(content, meta, hash);

        expect(result).toBe(`---
name: rdpi-approve
astp-source: fozy-labs/astp
astp-bundle: rdpi
astp-version: 1.0.0
astp-hash: hashvalue
---
Content`);
    });

    // T04: Inject into file without frontmatter
    it("T04: prepends frontmatter block to file without one", () => {
        const content = `# Stage: 01-Research
content`;

        const result = injectAstpFields(content, meta, hash);

        expect(result).toBe(`---
astp-source: fozy-labs/astp
astp-bundle: rdpi
astp-version: 1.0.0
astp-hash: hashvalue
---
# Stage: 01-Research
content`);
    });

    // T42: Preserve existing frontmatter field order on injection
    it("T42: preserves existing frontmatter field order on injection", () => {
        const content = `---
name: rdpi-approve
description: "desc"
tools: [search, read]
---
Body`;

        const result = injectAstpFields(content, meta, hash);

        // Existing fields in original order, astp-* appended at end
        const lines = result.split("\n");
        const nameIdx = lines.indexOf("name: rdpi-approve");
        const descIdx = lines.indexOf('description: "desc"');
        const toolsIdx = lines.indexOf("tools: [search, read]");
        const astpIdx = lines.indexOf("astp-source: fozy-labs/astp");

        expect(nameIdx).toBeLessThan(descIdx);
        expect(descIdx).toBeLessThan(toolsIdx);
        expect(toolsIdx).toBeLessThan(astpIdx);
    });
});

describe("stripAstpFields", () => {
    // T05: Strip astp fields, preserve other fields
    it("T05: removes only astp fields from mixed frontmatter", () => {
        const content = `---
name: rdpi-approve
astp-source: fozy-labs/astp
astp-bundle: rdpi
astp-version: 1.0.0
astp-hash: abc123
---
Body`;

        const result = stripAstpFields(content);

        expect(result).toBe(`---
name: rdpi-approve
---
Body`);
    });

    // T06: Strip astp fields from astp-only frontmatter — remove entire block
    it("T06: removes entire frontmatter block when only astp fields existed", () => {
        const content = `---
astp-source: fozy-labs/astp
astp-bundle: rdpi
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

describe("inject → strip round-trip", () => {
    const meta = { source: "fozy-labs/astp", bundle: "test", version: "1.0.0" };

    // T25: Round-trip preserves original content (with frontmatter)
    it("T25: inject then strip returns original content (file with frontmatter)", () => {
        const original = `---
name: foo
description: "bar"
---
Body content`;

        const injected = injectAstpFields(original, meta, "somehash");
        const stripped = stripAstpFields(injected);

        expect(stripped).toBe(original);
    });

    // T25: Round-trip preserves original content (without frontmatter)
    it("T25: inject then strip returns original content (file without frontmatter)", () => {
        const original = `# Stage
Content here`;

        const injected = injectAstpFields(original, meta, "somehash");
        const stripped = stripAstpFields(injected);

        expect(stripped).toBe(original);
    });
});
