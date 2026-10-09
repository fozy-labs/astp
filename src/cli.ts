#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { Command } from "commander";

import { executeCheck } from "@/commands/check.js";
import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { executeList } from "@/commands/list.js";
import { executeUpdate } from "@/commands/update.js";
import type { InstallTargetType, Platform } from "@/types/index.js";
import { ALL_PLATFORMS } from "@/types/index.js";
import { launchWizard } from "@/ui/wizard.js";

const VALID_TARGETS: ReadonlySet<InstallTargetType> = new Set(["project", "user"]);

const SOURCE_HELP =
    "Manifest source: local path, owner/repo[#ref], GitHub URL, gh:/gitlab:/bitbucket:/sourcehut:, npm:<name>[@version], or URL";

const PLATFORM_HELP = `Coding agent platform: ${ALL_PLATFORMS.join(", ")}`;

const TARGET_HELP = "project (./.claude/) or user ($CLAUDE_CONFIG_DIR or ~/.claude/); required without a terminal";

function collect(value: string, previous: string[] = []): string[] {
    return [...previous, value];
}

function parsePlatform(value: string | undefined): Platform | undefined {
    if (value === undefined) return undefined;
    if (!ALL_PLATFORMS.includes(value as Platform)) {
        throw new Error(`Invalid --platform value '${value}'. Expected one of: ${ALL_PLATFORMS.join(", ")}`);
    }
    return value as Platform;
}

function parseTarget(value: string | undefined): InstallTargetType | undefined {
    if (value === undefined) return undefined;
    if (!VALID_TARGETS.has(value as InstallTargetType)) {
        throw new Error(`Invalid --target value '${value}'. Expected one of: project, user`);
    }
    return value as InstallTargetType;
}

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version?: string;
};

const program = new Command();

program
    .name("astp")
    .description("Install and update skills, agents and rules for AI coding agents. No command: interactive wizard.")
    .version(version ?? "0.0.0")
    .action(async () => {
        await launchWizard();
    });

program
    .command("install")
    .description("Install a bundle, or add units and blocks to it")
    .argument("[bundle]", "Bundle name; required without a terminal")
    .option("--source <spec>", SOURCE_HELP)
    .option("--skill <name>", "Add a unit by name or path; repeatable", collect)
    .option("--block <name>", "Add a block by name or key (file#name), with its unit; repeatable", collect)
    .option("--force", "Overwrite files changed locally or not installed by astp")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", TARGET_HELP)
    .addHelpText(
        "after",
        "\nWithout --skill or --block: a terminal asks which units to install; without one,\nevery unit and non-optional block is selected, clearing earlier declines.\n--skill and --block add to the current selection.",
    )
    .action(
        async (
            bundle: string | undefined,
            options: {
                source?: string;
                skill?: string[];
                block?: string[];
                force?: boolean;
                platform?: string;
                target?: string;
            },
        ) => {
            await executeInstall({
                bundle,
                source: options.source,
                skills: options.skill,
                blocks: options.block,
                force: options.force,
                platform: parsePlatform(options.platform),
                target: parseTarget(options.target),
            });
        },
    );

program
    .command("update")
    .description("Update installed bundles from the sources recorded in astp.lock")
    .option("--force", "Overwrite locally changed files; delete changed ones dropped upstream")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", TARGET_HELP)
    .addHelpText(
        "after",
        "\nNew units are installed (a terminal asks first). Units dropped upstream are\nremoved; locally changed ones stay in place and leave astp.lock.",
    )
    .action(async (options: { force?: boolean; platform?: string; target?: string }) => {
        await executeUpdate({
            force: options.force,
            platform: parsePlatform(options.platform),
            target: parseTarget(options.target),
        });
    });

program
    .command("check")
    .description("Report bundles with updates or out of sync with their source; changes nothing")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", TARGET_HELP)
    .action(async (options: { platform?: string; target?: string }) => {
        await executeCheck({
            platform: parsePlatform(options.platform),
            target: parseTarget(options.target),
        });
    });

program
    .command("list")
    .description("List bundles, or the units and blocks of one bundle")
    .argument("[bundle]", "Bundle name to list")
    .option("--source <spec>", SOURCE_HELP)
    .option("--json", "Print JSON only; requires --target. Block keys are values for install --block")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", TARGET_HELP)
    .action(
        async (
            bundle: string | undefined,
            options: { source?: string; json?: boolean; platform?: string; target?: string },
        ) => {
            await executeList({
                bundle,
                source: options.source,
                json: options.json,
                platform: parsePlatform(options.platform),
                target: parseTarget(options.target),
            });
        },
    );

program
    .command("delete")
    .description("Delete an installed bundle or some of its units")
    .argument("[bundle]", "Installed bundle name; required without a terminal")
    .option("--skill <name>", "Delete a unit by name or path; repeatable", collect)
    .option("--force", "Also delete locally changed files")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", TARGET_HELP)
    .action(
        async (
            bundle: string | undefined,
            options: { skill?: string[]; force?: boolean; platform?: string; target?: string },
        ) => {
            await executeDelete({
                bundle,
                skills: options.skill,
                force: options.force,
                platform: parsePlatform(options.platform),
                target: parseTarget(options.target),
            });
        },
    );

await program.parseAsync();
