import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { shouldPersistEvent } = require("../../templates/agreement/skills/brainstorming/scripts/server.cjs") as {
    shouldPersistEvent(event: unknown): boolean;
};

describe("brainstorming companion events", () => {
    it.each([
        ["a click selection", { type: "click", choice: "a" }],
        ["an explicit choice", { type: "choice", value: "a" }],
        ["a falsy explicit choice", { type: "choice", value: false }],
    ])("persists %s", (_label, event) => {
        expect(shouldPersistEvent(event)).toBe(true);
    });

    it.each([
        ["an unrelated event", { type: "status", value: "ready" }],
        ["a click without a selection", { type: "click" }],
        ["an empty message", null],
    ])("does not persist %s", (_label, event) => {
        expect(shouldPersistEvent(event)).toBe(false);
    });
});
