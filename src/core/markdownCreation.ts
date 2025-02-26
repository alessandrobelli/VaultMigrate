import { moment, request } from "obsidian";
import { extractContentFromPage } from "./notionHandling";
import { 
    downloadFile, 
    generateUniqueTitle, 
    sanitizeTitle, 
    writeFilePromise,
    getFileExtension 
} from "../utils/fileUtils";
import * as path from "path";
import { ImportControl } from "../interfaces/NotionTypes";

/**
 * Creates markdown files from Notion data
 */
export async function createMarkdownFiles(
    allPages: any[],
    folderName: string,
    apiKey: string,
    app: any,
    attachPageId: boolean,
    importPageContent: boolean,
    importControl: ImportControl,
    logMessage: Function,
    createRelationContentPage: boolean,
    enabledProperties: { [key: string]: boolean },
    createSemanticLinking: boolean,
    attachmentPath: string,
    squashDateNamesForDataview: boolean,
    subpagesPath: string,
    importSubpages: boolean
) {
    const promises: Promise<any>[] = [];
    const vaultPath = app.vault.adapter.basePath; // Get the base path of the Obsidian vault
    let pageTitle = "";

    // Initial check if import should proceed
    if (!importControl || !importControl.isImporting) {
        logMessage("Import not active or was halted.");
        return;
    }

    for (const page of allPages) {
        if (!importControl.isImporting) {
            logMessage(
                "Import halted by user. Finishing remaining subpages and files..."
            );
            break;
        }
        let relationLinks: string[] = [];
        let relationSemanticLinks: string[] = [];
        let title = "empty";
        for (const [key, property] of Object.entries(page.properties as any)) {
            if ((property as any).title && ((property as any).title as any)[0]) {
                title = ((property as any).title as any)[0].plain_text;
                title = sanitizeTitle(title);

                break;
            }
        }
        // Append the Notion page ID to the title to ensure uniqueness
        if (attachPageId) title = `${title}_${page.id}`;
        else title = generateUniqueTitle(title, `${vaultPath}/${folderName}`);

        let content = `---\n`;

        for (const [key, property] of Object.entries(page.properties as any)) {
            if (enabledProperties[key] === false) {
                continue;
            }

            const safeKey = (key: string) => (/[^\w\s]/.test(key) ? `"${key}"` : key);
            const safeValue = (value: string) => 
                /[\W_]/.test(value) ? `"${value}"` : value;

            switch ((property as any).type) {
                case "select":
                    if ((property as any).select) {
                        content += `${safeKey(key)}: ${safeValue(
                            (property as any).select.name
                        )}\n`;
                    }
                    break;
                case "rich_text":
                    if ((property as any).rich_text && (property as any).rich_text.length) {
                        const textContent = (property as any).rich_text
                            .map((text: any) => text.plain_text)
                            .join("")
                            .replace(/\n/g, " "); // Replacing newline characters with spaces
                        content += `${safeKey(key)}: >-\n  ${safeValue(
                            textContent
                        )}\n`;
                    } else {
                        content += `${safeKey(key)}: null\n`;
                    }

                    break;
                case "checkbox":
                    content += `${safeKey(key)}: ${
                        (property as any).checkbox ? "true" : "false"
                    }\n`;
                    break;
                case "date": {
                    let finalKey = key;
                    if (squashDateNamesForDataview) {
                        finalKey = key
                            .split(" ")
                            .map(
                                (word) =>
                                    word.charAt(0).toUpperCase() + word.slice(1)
                            )
                            .join("");
                    }

                    if ((property as any).date && (property as any).date.start) {
                        let newDate = moment
                            .utc((property as any).date.start)
                            .toISOString();
                        content += `${safeKey(finalKey)}: ${newDate}\n`;
                    } else {
                        content += `${safeKey(finalKey)}: null\n`;
                    }
                    break;
                }

                case "number":
                    if ((property as any).number) {
                        content += `${safeKey(key)}: ${(property as any).number}\n`;
                    } else {
                        content += `${safeKey(key)}: \n`;
                    }
                    break;
                case "status":
                    if ((property as any).status && (property as any).status.name) {
                        content += `${safeKey(key)}: ${safeValue(
                            (property as any).status.name
                        )}\n`;
                    } else {
                        content += `${safeKey(key)}: \n`;
                    }
                    break;
                case "multi_select":
                    if ((property as any).multi_select && (property as any).multi_select.length) {
                        const tags = (property as any).multi_select
                            .map((tag: any) => `${tag.name}`)
                            .join(" ");
                        content += `${safeKey(key)}: ${tags}\n`;
                    }
                    break;
                case "files":
                    content += `${safeKey(key)}:\n`;
                    if ((property as any).files && (property as any).files.length > 0) {
                        for (const file of (property as any).files) {
                            try {
                                let fileUrl, fileName;

                                if (file.type === "external") {
                                    fileUrl = file.external?.url;
                                    fileName =
                                        fileUrl.split("/").pop() ||
                                        `external_file_${Date.now()}`;
                                } else if (file.type === "file") {
                                    fileUrl = file.file?.url;
                                    fileName =
                                        file.name ||
                                        `notion_file_${Date.now()}`;
                                }

                                if (!fileUrl) {
                                    console.warn(
                                        `No URL found for file: ${fileName}`
                                    );
                                    continue;
                                }

                                const fileExtension = getFileExtension(fileUrl);
                                const safeFileName = sanitizeTitle(fileName);
                                const outputPath = path.join(
                                    attachmentPath,
                                    `${safeFileName}${
                                        fileExtension ? "." + fileExtension : ""
                                    }`
                                );

                                await downloadFile(
                                    fileUrl,
                                    outputPath,
                                    app
                                );
                                content += `  - [[${path.basename(
                                    outputPath
                                )}]]\n`;
                                logMessage(`Downloaded file: ${fileName}`);
                            } catch (error) {
                                const errorMsg = `Failed to download file: ${error.message}`;
                                console.error(errorMsg);
                                logMessage(errorMsg);
                                content += `  - Failed: ${
                                    file.name || "unnamed file"
                                } (${error.message})\n`;
                            }
                        }
                    } else {
                        content += `  []\n`;
                    }
                    break;

                case "formula":
                    let formulaType = (property as any).formula.type;
                    let formulaValue = "";

                    switch (formulaType) {
                        case "number":
                            formulaValue = (property as any).formula.number;
                            content += `${safeKey(key)}: ${formulaValue}\n`;
                            break;

                        case "string":
                            formulaValue = (property as any).formula.string;
                            content += `${safeKey(key)}: ${formulaValue}\n`;
                            break;
                        case "boolean":
                            // Handle boolean formula
                            content += `${safeKey(key)}: ${
                                (property as any).formula.boolean
                            }\n`;
                            break;

                        default:
                            console.warn(
                                `Unknown formula type: ${formulaType}`
                            );
                            break;
                    }
                    break;
                case "created_time":
                    if ((property as any).created_time) {
                        let createdDate = moment
                            .utc((property as any).created_time)
                            .toISOString();
                        content += `${safeKey(key)}: ${createdDate}\n`;
                    } else {
                        content += `${safeKey(key)}: \n`;
                    }
                    break;
                case "relation":
                    if ((property as any).relation && (property as any).relation.length) {
                        const requestHeaders = {
                            Authorization: `Bearer ${apiKey}`,
                            "Notion-Version": "2022-06-28",
                            "Content-Type": "application/json",
                        };

                        let relatedNames: string[] = [];
                        for (const rel of (property as any).relation) {
                            const pageId = rel.id;
                            const response = await request({
                                url: `https://api.notion.com/v1/pages/${pageId}`,
                                method: "GET",
                                headers: requestHeaders,
                            });
                            const pageData = JSON.parse(response);
                            const pageName =
                                pageData.properties.Name.title[0].plain_text;
                            relatedNames.push(pageName);
                        }

                        // Semantic Linking part
                        if (createSemanticLinking) {
                            const safeKeyWithUnderscores = safeKey(key).replace(
                                / /g,
                                "_"
                            );
                            const semanticLink = `${safeKeyWithUnderscores}:: ${relatedNames
                                .map((name) => `[[${name}]]`)
                                .join(", ")}\n`;
                            relationSemanticLinks.push(semanticLink);
                        }

                        if (createRelationContentPage) {
                            // Create relation in YAML list format - ONLY add to relationLinks, not to content directly
                            relationLinks.push(`${safeKey(key)}:\n${relatedNames
                                .map((name) => `  - [[${name}]]`)
                                .join("\n")}\n`);
                        } else {
                            // Create relation in YAML format directly in content
                            content += `${safeKey(key)}:\n${relatedNames
                                .map((name) => `  - ${name}`)
                                .join("\n")}\n`;
                        }
                    } else {
                        content += `${safeKey(key)}: \n`;
                    }
                    break;


                case "url":
                    if ((property as any).url) {
                        content += `${safeKey(key)}: ${(property as any).url}\n`;
                    } else {
                        content += `${safeKey(key)}: \n`;
                    }
                    break;

                case "rollup": {
                    const rollupArray = (property as any).rollup
                        ? (property as any).rollup.array
                        : null; // Check if rollup is defined

                    if (Array.isArray(rollupArray)) {
                        rollupArray.forEach((rollupItem) => {
                            switch (rollupItem.type) {
                                case "formula":
                                    switch (rollupItem.formula.type) {
                                        case "string":
                                            // Handle string formula inside rollup
                                            content += `${safeKey(
                                                key
                                            )}: ${safeValue(
                                                (rollupItem as any).formula.string
                                            )}\n`;
                                            break;
                                        case "boolean":
                                            // Handle boolean formula
                                            content += `${safeKey(key)}: ${
                                                (rollupItem as any).formula.boolean
                                            }\n`;
                                            break;
                                        case "number":
                                            if (
                                                rollupItem.function ===
                                                "percent_per_group"
                                            ) {
                                                const numberValue =
                                                    (rollupItem as any).number;
                                                content += `${safeKey(
                                                    key
                                                )}: ${numberValue}\n`;
                                            }
                                            break;

                                        default:
                                            // Handle other or unknown formula types inside rollup
                                            break;
                                    }
                                    break;
                            }
                        });
                    } else {
                        content += `${safeKey(key)}: null\n`; // Handle case when rollupArray is not defined
                    }
                }
                    break;

                case "title":
                    if ((property as any).title && (property as any).title[0]) {
                        const keyWithUnderscores =
                            (property as any).title[0].plain_text.replace(/ /g, "_");
                        const finalKey = safeKey(keyWithUnderscores);
                        pageTitle = finalKey;
                        content += `Alias: ${finalKey}\n`;
                    } else {
                        content += `Alias: \n`;
                    }
                    break;

                default:
                    break;
            }
        }
        content += `---\n`;
        // Only add one type of relation formatting based on settings
        if (createSemanticLinking && relationSemanticLinks.length > 0) {
            content += relationSemanticLinks;
        } else if (relationLinks.length > 0) {
            content += relationLinks;
        }

        if (importPageContent) {
            try {
                await extractContentFromPage(
                    page.id,
                    pageTitle,
                    apiKey,
                    attachmentPath,
                    vaultPath,
                    subpagesPath,
                    logMessage,
                    importControl,
                    app,
                    importSubpages
                ).then((result) => (content += result || ""));
            } catch (error) {
                console.error("Error in extractContentFromPage:", error);
            }
        }

        // Add feedback for current file
        logMessage(`Importing: ${title}`);

        if (!importControl.forceStop) {
            promises.push(
                writeFilePromise(
                    `${vaultPath}/${folderName}/${title}.md`,
                    content
                )
            );
        }
    }
    // Wait for all file writes to complete if we should continue
    if (importControl.isImporting && !importControl.forceStop) {
        await Promise.all(promises);

        // Signal completion only if we're still importing
        if (importControl.isImporting) {
            logMessage("Migration completed automatically!");
            importControl.isImporting = false;
        }
    }
}
