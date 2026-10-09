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

const PLATFORM_HELP = `Coding agent platform: ${ALL_PLATFORMS.join(", ")}`;

function collect(value: string, previous: string[]): string[] {
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
    .description("MDA file manager for AI coding agents")
    .version(version ?? "0.0.0")
    .action(async () => {
        await launchWizard();
    });

program
    .command("install")
    .argument("[bundle]", "Bundle name to install")
    .option("--skill <name>", "Install one unit by name or path", collect, [])
    .option("--block <name>", "Install one block by name or key (file#name)", collect, [])
    .option("--force", "Overwrite locally modified or unmanaged files")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", "Install target: project or user")
    .action(
        async (
            bundle: string | undefined,
            options: { skill: string[]; block: string[]; force?: boolean; platform?: string; target?: string },
        ) => {
            await executeInstall({
                bundle,
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
    .option("--force", "Overwrite locally modified files")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", "Install target: project or user")
    .action(async (options: { force?: boolean; platform?: string; target?: string }) => {
        await executeUpdate({
            force: options.force,
            platform: parsePlatform(options.platform),
            target: parseTarget(options.target),
        });
    });

program
    .command("check")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", "Install target: project or user")
    .action(async (options: { platform?: string; target?: string }) => {
        await executeCheck({
            platform: parsePlatform(options.platform),
            target: parseTarget(options.target),
        });
    });

program
    .command("list")
    .argument("[bundle]", "Bundle name to list")
    .option("--json", "Print JSON only")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", "Install target: project or user")
    .action(async (bundle: string | undefined, options: { json?: boolean; platform?: string; target?: string }) => {
        await executeList({
            bundle,
            json: options.json,
            platform: parsePlatform(options.platform),
            target: parseTarget(options.target),
        });
    });

program
    .command("delete")
    .argument("[bundle]", "Installed bundle name to delete")
    .option("--skill <name>", "Delete one unit by name or path", collect, [])
    .option("--force", "Delete locally modified files")
    .option("--platform <name>", PLATFORM_HELP)
    .option("--target <type>", "Install target: project or user")
    .action(
        async (
            bundle: string | undefined,
            options: { skill: string[]; force?: boolean; platform?: string; target?: string },
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
