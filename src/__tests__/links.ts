import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** False where creating a file symlink needs extra rights (Windows without Developer Mode). */
export const canSymlinkFiles = await (async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-link-"));
    try {
        await fs.writeFile(path.join(dir, "target"), "");
        await fs.symlink(path.join(dir, "target"), path.join(dir, "link"), "file");
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
        return false;
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
})();
