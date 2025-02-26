import { request } from "obsidian";
import * as path from "path";
import { downloadFile, getImageExtension, writeFilePromise } from "../utils/fileUtils";
import { ImportControl } from "../interfaces/NotionTypes";

/**
 * Helper function to safely add a file writing promise to the promises array
 */
function safeAddWritePromise(promises: Array<Promise<any>>, filePath: string, content: string | null) {
    if (content !== null) {
        promises.push(writeFilePromise(filePath, content));
    }
}

/**
 * Fetches the name of a Notion database
 */
export async function getDatabaseName(apiKey: string, databaseId: string): Promise<string | null> {
    const requestHeaders = {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    };

    try {
        const response = await request({
            url: `https://api.notion.com/v1/databases/${databaseId}`,
            method: "GET",
            headers: requestHeaders,
        });

        const data = JSON.parse(response);
        return data.title[0].plain_text; // Extracting the database name from the response
    } catch (error) {
        console.error("Error fetching database name:", error);
        return null; // Return null if there's an error
    }
}

/**
 * Fetches data from a Notion database
 */
export async function fetchNotionData(databaseId: string, apiKey: string) {
    const requestHeaders = {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    };

    let results: any[] = [];
    let hasMore = true;
    let startCursor = null;

    while (hasMore) {
        const requestBody = startCursor ? {start_cursor: startCursor} : {};

        const response = await request({
            url: `https://api.notion.com/v1/databases/${databaseId}/query`,
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
        });

        const data = JSON.parse(response);

        results.push(...data.results);

        hasMore = data.has_more;
        startCursor = data.next_cursor;
    }

    return results;
}

/**
 * Processes block content from Notion
 */
async function fetchBlockContent(
    blocks: any,
    previousBlockType: string,
    numberCounter: number,
    content: string,
    attachmentPath: string,
    apiKey: string,
    pageName: string,
    fileCounter: number,
    vaultPath: string,
    safeKey: Function,
    promises: Array<Promise<any>>,
    subpagesPath: string,
    importControl: ImportControl,
    app: any,
    logMessage: Function,
    importSubpages: boolean
) {
    importControl = importControl || {isImporting: false, forceStop: false}; 
    
    for (const block of blocks.results) {
        if (importControl && importControl.forceStop) {
            return content;
        }
        // Reset the numbered list counter if the block type changes
        if (
            previousBlockType === "numbered_list_item" &&
            block.type !== "numbered_list_item"
        ) {
            numberCounter = 1;
        }
        switch (block.type) {
            case "rich_text":
                if (block.rich_text && block.rich_text.length) {
                    content += `${block.rich_text
                        .map((text) => text.plain_text)
                        .join("")}\n\n`;
                }
                break;
            case "paragraph":
                if (
                    block.paragraph &&
                    block.paragraph.rich_text &&
                    block.paragraph.rich_text.length
                ) {
                    let paragraphContent = "";
                    for (const richTextElement of block.paragraph.rich_text) {
                        if (richTextElement.type === "text") {
                            if (richTextElement.href) {
                                paragraphContent += `[${richTextElement.plain_text}](${richTextElement.href})`;
                            } else {
                                paragraphContent += richTextElement.plain_text;
                            }
                        } else if (
                            richTextElement.type === "mention" &&
                            richTextElement.mention.type === "date"
                        ) {
                            const originalDate = new Date(
                                richTextElement.plain_text
                            );
                            const formattedDate = `${originalDate.getDate()}.${
                                originalDate.getMonth() + 1
                            }.${originalDate.getFullYear()}`;
                            paragraphContent += `[[${formattedDate}]]`; // Date formatted as DD.MM.YYYY
                        } else {
                            // Handle other types as needed
                        }
                    }
                    content += `${paragraphContent}\n\n`;
                }
                break;

            case "heading_1":
            case "heading_2":
            case "heading_3":
                if (
                    block[block.type] &&
                    block[block.type].rich_text &&
                    block[block.type].rich_text.length
                ) {
                    const heading = `#`.repeat(
                        Number(block.type.split("_")[1])
                    );
                    let headingContent = "";
                    for (const richTextElement of block[block.type].rich_text) {
                        let text = richTextElement.plain_text;
                        if (richTextElement.annotations.bold) {
                            text = `**${text}**`;
                        }
                        if (richTextElement.annotations.italic) {
                            text = `*${text}*`;
                        }
                        headingContent += text;
                    }
                    content += `${heading} ${headingContent}\n\n`;
                }
                break;

            case "bulleted_list_item":
            case "numbered_list_item":
                if (
                    block[block.type] &&
                    block[block.type].rich_text &&
                    block[block.type].rich_text.length
                ) {
                    const prefix =
                        block.type === "bulleted_list_item"
                            ? "-"
                            : `${numberCounter}.`;

                    // Increment the number counter if it's a numbered list item
                    if (block.type === "numbered_list_item") {
                        numberCounter++;
                    }

                    let listItemContent = "";
                    for (const richTextElement of block[block.type].rich_text) {
                        let textContent = richTextElement.plain_text;

                        // Apply bold formatting if needed
                        if (richTextElement.annotations.bold) {
                            textContent = `**${textContent}**`;
                        }

                        // Apply italic formatting if needed
                        if (richTextElement.annotations.italic) {
                            textContent = `*${textContent}*`;
                        }

                        listItemContent += textContent;
                    }

                    content += `${prefix} ${listItemContent}\n`;
                }
                break;

            case "image":
                if (importControl && importControl.forceStop) {
                    return content;
                }
                if (
                    block.image &&
                    block.image.external &&
                    block.image.external.url
                ) {
                    // Handle external images
                    content += `![](${block.image.external.url})\n\n`;
                } else if (
                    block.image &&
                    block.image.file &&
                    block.image.file.url
                ) {
                    // Handle images uploaded to Notion
                    const imageUrl = block.image.file.url;
                    const fileExtension = getImageExtension(imageUrl);
                    const imagePath = path.join(
                        attachmentPath, // Use attachmentPath here
                        `image_${Date.now()}.${fileExtension}`
                    );
                    await downloadFile(imageUrl, imagePath, app); // Assuming app is available
                    content += `![[${path.basename(imagePath)}]]\n\n`;
                }
                break;
            case "to_do":
                if (
                    block.to_do &&
                    block.to_do.rich_text &&
                    block.to_do.rich_text.length
                ) {
                    const checkbox = block.to_do.checked ? "[x]" : "[ ]";
                    let todoContent = "";
                    for (const richTextElement of block.to_do.rich_text) {
                        let textContent = richTextElement.plain_text;
                        if (richTextElement.annotations.bold) {
                            textContent = `**${textContent}**`;
                        }
                        if (richTextElement.annotations.italic) {
                            textContent = `*${textContent}*`;
                        }
                        todoContent += textContent;
                    }
                    content += `${checkbox} ${todoContent}\n`;
                }
                break;
            case "table":
                if (block.table && block.table.headers && block.table.rows) {
                    content += "| " + block.table.headers.join(" | ") + " |\n";
                    content +=
                        "| " +
                        new Array(block.table.headers.length)
                            .fill("---")
                            .join(" | ") +
                        " |\n";
                    block.table.rows.forEach((row) => {
                        content += "| " + row.join(" | ") + " |\n";
                    });
                }
                break;
            case "code":
                if (
                    block.code &&
                    block.code.rich_text &&
                    block.code.rich_text.length
                ) {
                    let codeContent = block.code.rich_text
                        .map((text) => text.plain_text)
                        .join("");
                    const language = block.code.language
                        ? block.code.language
                        : "";
                    content += `\`\`\`${language}\n${codeContent}\n\`\`\`\n\n`;
                }
                break;

            case "link_preview":
                if (block.link_preview && block.link_preview.url) {
                    const linkUrl = block.link_preview.url;
                    content += `[Link Preview](${linkUrl})\n\n`;
                }
                break;

            case "toggle":
                if (
                    block.toggle &&
                    block.toggle.rich_text &&
                    block.toggle.rich_text.length
                ) {
                    let toggleContent = "";
                    for (const richTextElement of block.toggle.rich_text) {
                        let textContent = richTextElement.plain_text;
                        toggleContent += textContent;
                    }
                    content += `> [!NOTE]+ ${toggleContent} \n`;
                }
                break;

            case "video":
                if (importControl && importControl.forceStop) {
                    return content;
                }
                if (
                    block.video &&
                    block.video.type === "external" &&
                    block.video.external.url
                ) {
                    const videoUrl = block.video.external.url;
                    content += `Video: [${videoUrl}](${videoUrl})\n\n`;
                }
                break;
            case "audio":
                if (importControl && importControl.forceStop) {
                    return content;
                }
                if (block.audio && block.audio.file && block.audio.file.url) {
                    const audioUrl = block.audio.file.url;
                    const audioExtension = path.extname(
                        new URL(audioUrl).pathname
                    );
                    const audioFileName = `${pageName}_${fileCounter}${audioExtension}`;
                    const audioFilePath = path.join(
                        attachmentPath, // Use attachmentPath here
                        audioFileName
                    );
                    await downloadFile(audioUrl, audioFilePath, app); // Assuming app is available

                    content += `![[${path.basename(audioFilePath)}]]\n\n`; // Or however you want to reference the audio file

                    // Increment the file counter
                    fileCounter++;
                }
                break;
            case "file":
                if (importControl && importControl.forceStop) {
                    return content;
                }
                if (block.file && block.file.file && block.file.file.url) {

                    const fileUrl = block.file.file.url;
                    const fileExtension = path.extname(
                        new URL(fileUrl).pathname
                    );
                    const fileName = `${pageName}_${fileCounter}${fileExtension}`;
                    const filePath = path.join(attachmentPath, fileName);
                    await downloadFile(fileUrl, filePath, app);

                    content += `![[${path.basename(filePath)}]]\n\n`;

                    // Increment the file counter
                    fileCounter++;
                } else if (block.external && block.external.url) {
                    const externalUrl = block.external.url;
                    content += `[[${externalUrl}]]\n\n`; // Adjusted format for external links as well
                }
                break;
            case "bookmark":
                if (block.bookmark && block.bookmark.url) {
                    let titleText = block.bookmark.caption
                        .map((text) => text.plain_text)
                        .join("");
                    titleText = titleText || block.bookmark.url;
                    const bookmarkUrl = block.bookmark.url;
                    content += `[${titleText}](${bookmarkUrl})\n\n`;
                }
                break;
            case "child_page":
                if (importControl && importControl.forceStop) {
                    return content;
                }
                if (block.child_page && block.child_page.title) {
                    const childPageTitle = block.child_page.title;

                    // Only process the child page content if importSubpages is true
                    if (importSubpages) {
                        const childPageId = block.id;

                        // Make a recursive call to fetch the content of the child page
                        let childContent = await extractContentFromPage(
                            childPageId,
                            childPageTitle,
                            apiKey,
                            attachmentPath,
                            vaultPath,
                            subpagesPath,
                            logMessage,
                            importControl,
                            app,
                            importSubpages // Pass the parameter
                        );

                        // Ensure childContent is a string, even if null was returned
                        childContent = childContent || "";

                        // Prepare the path to save the subpage in the folder in the vault
                        const subpagePath = `${vaultPath}/${subpagesPath}/${safeKey(
                            childPageTitle
                        )}.md`;

                        // Use our safe helper function to add the promise
                        safeAddWritePromise(promises, subpagePath, childContent);
                    }

                    // Add link based on importSubpages setting
                    if (importSubpages) {
                        // Internal wikilink if we're importing the page
                        content += `[[${childPageTitle}]]\n\n`;
                    } else {
                        // External link to Notion page if not importing
                        const notionPageUrl = `https://www.notion.so/${block.id.replace(/-/g, '')}`;
                        content += `[${childPageTitle}](${notionPageUrl})\n\n`;
                    }
                }
                break;
        }
        // Update the previous block type
        previousBlockType = block.type;

        if (block.has_children) {

            if (importControl && importControl.forceStop) {
                return content;
            }
            // Fetch children of the block
            const childBlocksResponse = await request({
                url: `https://api.notion.com/v1/blocks/${block.id}/children`,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Notion-Version": "2022-06-28",
                },
            });
            const childBlocks = JSON.parse(childBlocksResponse);
            if (importControl && importControl.forceStop) {
                return content;
            }
            // Recursively get the content for child blocks
            const childContent = await fetchBlockContent(
                {results: childBlocks.results},
                previousBlockType,
                numberCounter,
                "",
                attachmentPath,
                apiKey,
                pageName,
                fileCounter,
                vaultPath,
                safeKey,
                promises,
                subpagesPath,
                importControl,
                app,
                logMessage,
                importSubpages
            );

            // Add ">" at the start of each line if the block is a "toggle" type
            if (block.type === "toggle") {
                const indentedChildContent = childContent
                    .split("\n")
                    .map((line) => "> " + line)
                    .join("\n");
                content += indentedChildContent;
            } else {
                content += childContent;
            }
        }
    }

    return content;
}

/**
 * Extracts content from a Notion page
 */
export async function extractContentFromPage(
    pageId: string,
    pageName: string,
    apiKey: string,
    attachmentPath: string,
    vaultPath: string,
    subpagesPath: string,
    logMessage: Function,
    importControl: ImportControl,
    app: any,
    importSubpages: boolean
): Promise<string | null> {
    importControl = importControl || {isImporting: false, forceStop: false}; 
    if (importControl && importControl.forceStop) {
        logMessage && logMessage("Import stopped by user.");
        return "";
    }

    const requestHeaders = {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    };

    const safeKey = (key: string) => (/[^\w\s]/.test(key) ? `"${key}"` : key);

    const response = await request({
        url: `https://api.notion.com/v1/blocks/${pageId}/children`,
        method: "GET",
        headers: requestHeaders,
    });

    const blocks = JSON.parse(response);

    const promises: Array<Promise<any>> = [];
    let content = "";
    let numberCounter = 1;
    let fileCounter = 1;
    let previousBlockType = null; // Keep track of the previous block type

    if (importControl && importControl.forceStop) {
        logMessage && logMessage("Import stopped by user.");
        return "";
    }

    content = await fetchBlockContent(
        blocks,
        previousBlockType,
        numberCounter,
        content,
        attachmentPath,
        apiKey,
        pageName,
        fileCounter,
        vaultPath,
        safeKey,
        promises,
        subpagesPath,
        importControl,
        app,
        logMessage,
        importSubpages
    );

    if (importControl && importControl.forceStop) {
        logMessage && logMessage("Import stopped by user.");
        return content;
    }

    // Filter out any null values before awaiting promises
    await Promise.all(promises.filter(Boolean));
    return content;
}
