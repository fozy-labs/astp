#!/usr/bin/env node
import { Command } from "commander";

import { executeCheck } from "@/commands/check.js";
import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";
import { launchWizard } from "@/ui/wizard.js";

const program = new Command();

program
    .name("astp")
    .description("MDA file manager for AI coding agents")
    .version("0.1.4")
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

await program.parseAsync();
