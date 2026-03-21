import { executeCheck } from "@/commands/check.js";
import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";

import { intro, outro, selectAction } from "./prompts.js";

export async function launchWizard(): Promise<void> {
    intro("astp — MDA Manager");

    const action = await selectAction();

    switch (action) {
        case "install":
            await executeInstall({});
            break;
        case "update":
            await executeUpdate({});
            break;
        case "check":
            await executeCheck({});
            break;
    }

    outro("Done!");
}
