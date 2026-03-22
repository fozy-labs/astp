#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { Command } from "commander";

import { executeCheck } from "@/commands/check.js";
import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";
import { launchWizard } from "@/ui/wizard.js";

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
    .option("--target <type>", "Install target: project or user")
    .action(async (bundle: string | undefined, options: { target?: string }) => {
        await executeInstall({
            bundle,
            target: options.target as "project" | "user" | undefined,
        });
    });

program
    .command("update")
    .option("--force", "Overwrite locally modified files")
    .option("--target <type>", "Install target: project or user")
    .action(async (options: { force?: boolean; target?: string }) => {
        await executeUpdate({
            force: options.force,
            target: options.target as "project" | "user" | undefined,
        });
    });

program
    .command("check")
    .option("--target <type>", "Install target: project or user")
    .action(async (options: { target?: string }) => {
        await executeCheck({
            target: options.target as "project" | "user" | undefined,
        });
    });

program
    .command("delete")
    .argument("[bundle]", "Installed bundle name to delete")
    .option("--force", "Delete locally modified files")
    .option("--target <type>", "Install target: project or user")
    .action(async (bundle: string | undefined, options: { force?: boolean; target?: string }) => {
        await executeDelete({
            bundle,
            force: options.force,
            target: options.target as "project" | "user" | undefined,
        });
    });

await program.parseAsync();
