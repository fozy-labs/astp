import { downloadTemplate } from "giget";

export async function downloadBundle(repository: string, bundleName: string, ref?: string): Promise<string> {
    const branch = ref ?? "main";
    const source = `gh:${repository}/src/templates/${bundleName}#${branch}`;

    try {
        const result = await downloadTemplate(source, {
            auth: process.env.GIGET_AUTH || undefined,
        });
        return result.dir;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to download bundle '${bundleName}': ${message}`);
    }
}
