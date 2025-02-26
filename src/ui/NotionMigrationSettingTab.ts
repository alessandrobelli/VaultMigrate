import { App, Notice, PluginSettingTab, Setting, TFolder, request } from "obsidian";
import NotionMigrationPlugin from "../main";
import { FolderSuggest } from "./FolderSuggest";
import { fetchNotionData, getDatabaseName } from "../core/notionHandling";
import { createMarkdownFiles } from "../core/markdownCreation";
import { NotionProperties } from "../interfaces/NotionTypes";
import tippy from 'tippy.js';

export class NotionMigrationSettingTab extends PluginSettingTab {
    plugin: NotionMigrationPlugin;
    collapsibleContent: HTMLElement;
    loadingEl: HTMLElement;
    statusEl: HTMLElement;
    dbIdInput: HTMLInputElement;
    private activeNotice: Notice | null = null;

    constructor(app: App, plugin: NotionMigrationPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    showLoading(message: string) {
        if (this.activeNotice) {
            this.activeNotice.hide();
        }
        this.activeNotice = new Notice(message, 5000);
        return this.activeNotice;
    }

    hideLoading(notice?: Notice | null) {
        if (notice || this.activeNotice) {
            (notice || this.activeNotice)?.hide();
            this.activeNotice = null;
        }
    }

    showStatus(message: string, type: 'success' | 'error' | 'info' = 'info') {
        const duration = type === 'error' ? 10000 : 3000;
        new Notice(message, duration);
    }

    private listAllDirectories(): any[] {
        const directories: any[] = [];
        const items = this.app.vault.getAllLoadedFiles();

        for (const item of items) {
            if (item instanceof TFolder) {
                directories.push(item);
            }
        }

        return directories;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        let {logWindow, startButton, stopButton} = this.createUI(containerEl);

        if (this.plugin.settings.isImporting) {
            startButton.textContent = "Migrating...";
            startButton.disabled = true;
            stopButton.disabled = false;
        } else {
            startButton.textContent = "Start Migration";
            startButton.disabled = false;
            stopButton.disabled = true;
        }

        logWindow.value = this.plugin.settings.migrationLog;
        stopButton.disabled = !this.plugin.importControl.isImporting;

        const logMessage = (message: string) => {
            logWindow.value += `${message}\n`;
            logWindow.scrollTop = logWindow.scrollHeight;
            this.plugin.settings.migrationLog = logWindow.value;
            this.plugin.saveSettings();
        };

        startButton.addEventListener("click", async () => {
            try {
                this.showLoading("Starting migration...");
                const migrationPath = this.plugin.settings.migrationPath;

                // Check if the folder exists
                const folder = this.app.vault.getAbstractFileByPath(migrationPath);
                if (!folder || !(folder instanceof TFolder)) {
                    logWindow.value += `Error: Folder "${migrationPath}" does not exist.\n`;
                    this.showStatus(`Error: Folder "${migrationPath}" does not exist`, "error");
                    return;
                }

                this.plugin.settings.isImporting = true;
                await this.plugin.saveSettings();
                this.plugin.importControl.isImporting = true;

                // Show the status bar indicator
                this.plugin.showImportStatus();

                stopButton.disabled = false;
                startButton.textContent = "Migrating...";
                startButton.disabled = true;

                const logMessage = (message: string) => {
                    logWindow.value += `${message}\n`;
                    logWindow.scrollTop = logWindow.scrollHeight;
                    this.plugin.settings.migrationLog = logWindow.value;
                    this.plugin.saveSettings();
                };

                const dbName = await getDatabaseName(this.plugin.settings.apiKey, this.plugin.settings.databaseId);
                if (dbName) {
                    logMessage(`Starting to migrate content from Notion database: ${dbName}`);
                } else {
                    logMessage("Starting to migrate content from Notion...");
                }

                logMessage("Fetching data from Notion...");
                const allPages = await fetchNotionData(
                    this.plugin.settings.databaseId,
                    this.plugin.settings.apiKey
                );
                logMessage(`${allPages.length} items fetched from Notion.`);

                logMessage("Creating markdown files...");
                await createMarkdownFiles(
                    allPages,
                    this.plugin.settings.migrationPath,
                    this.plugin.settings.apiKey,
                    this.app,
                    this.plugin.settings.attachPageId,
                    this.plugin.settings.importPageContent,
                    this.plugin.importControl,
                    logMessage,
                    this.plugin.settings.createRelationContentPage,
                    this.plugin.settings.enabledProperties,
                    this.plugin.settings.createSemanticLinking,
                    this.plugin.settings.attachmentPath,
                    this.plugin.settings.squashDateNamesForDataview,
                    this.plugin.settings.subpagesPath,
                    this.plugin.settings.importSubpages
                );
                // Check if the import was stopped by user or completed normally
                if (this.plugin.importControl.isImporting) {
                    logMessage("Migration completed!");
                    this.showStatus("Migration completed successfully!", "success");
                } else if (this.plugin.importControl.forceStop) {
                    logMessage("Migration was stopped by user.");
                    this.showStatus("Migration stopped by user", "info");
                } else {
                    logMessage("Migration ended with issues.");
                    this.showStatus("Migration ended. Check log for details.", "info");
                }

            } catch (error) {
                logWindow.value += `Error: ${error.message}\n`;
                this.showStatus(`Migration failed: ${error.message}`, "error");
            } finally {
                this.hideLoading();

                // Update UI regardless of success or failure
                startButton.textContent = "Start Migration";
                startButton.disabled = false;
                stopButton.disabled = true;

                // Reset the plugin's importing state
                this.plugin.settings.isImporting = false;
                this.plugin.importControl.isImporting = false;

                // Hide the status bar indicator
                this.plugin.hideImportStatus();

                await this.plugin.saveSettings();

                // Add extra logging to confirm state reset
                logMessage("Migration process ended.");
            }
        });

        stopButton.addEventListener("click", async () => {
            logMessage("Initiating graceful stop...");
            // Set both flags to false
            this.plugin.settings.isImporting = false;
            this.plugin.importControl.isImporting = false;
            // Add a new flag for immediate stop
            this.plugin.importControl.forceStop = true;

            // Hide the status bar indicator
            this.plugin.hideImportStatus();

            await this.plugin.saveSettings();
            stopButton.disabled = true;
            startButton.textContent = "Start Migration";
        });
    }

    async displayPageList() {
        try {
            this.showLoading("Fetching Notion databases...");

            const apiKey = this.plugin.settings.apiKey;
            if (!apiKey) {
                this.showStatus("Please enter your Notion API key first", "error");
                return;
            }

            const query = '';
            const requestOptions = {
                method: 'POST',
                url: 'https://api.notion.com/v1/search',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    filter: {
                        value: 'database',
                        property: 'object',
                    },
                }),
            };

            const response = await request(requestOptions);
            const responseData = JSON.parse(response);

            const container = document.getElementById('page-list-container');
            if (!container) return;
            container.innerHTML = '';

            const buttonContainer = container.createDiv({
                cls: 'hide-button-container',
                attr: {
                    style: 'margin-top: 10px; margin-bottom: 10px;display: flex; justify-content: space-between;'
                }
            });

            const hideButton = buttonContainer.createEl('button', {text: 'Hide'});
            hideButton.addEventListener('click', () => {
                tableWrapper.style.display = tableWrapper.style.display === 'none' ? 'block' : 'none';
            });

            const messageSpan = buttonContainer.createEl('span', {
                text: 'Click on a row to select a database. Hover to see properties.',
                attr: {}
            });

            const tableWrapper = container.createEl('div', {
                attr: {style: 'max-height: 350px; overflow-y: auto;'}
            });

            const table = tableWrapper.createEl('table', {
                attr: {style: 'width: 100%; border-collapse: collapse;position: relative'}
            });

            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');
            headerRow.createEl('th', {text: 'Page Name', attr: {style: 'padding: 10px; border: 1px solid #ccc;'}});
            headerRow.createEl('th', {text: 'Page ID', attr: {style: 'padding: 10px; border: 1px solid #ccc;'}});

            const tbody = table.createEl('tbody');

            for (const page of responseData.results) {
                const pageName = page.title && page.title[0] && page.title[0].plain_text
                    ? page.title[0].plain_text
                    : '';
                const row = tbody.createEl('tr');
                row.createEl('td', {text: pageName, attr: {style: 'padding: 10px; border: 1px solid #ccc;'}});
                row.createEl('td', {text: page.id, attr: {style: 'padding: 10px; border: 1px solid #ccc;'}});

                let propertiesText = "<strong>Properties</strong> <br>";
                for (const [key, value] of Object.entries(page.properties as any)) {
                    propertiesText += `${key} - ${(value as any).type} <br>`;
                }
                tippy(row, {
                    content: propertiesText,
                    allowHTML: true,
                    theme: 'light',
                    delay: 100,
                    arrow: true,
                    duration: [300, 200],
                });

                row.addEventListener('click', async () => {
                    try {
                        // Show loading notification
                        this.showStatus("Loading table properties...", "info");

                        // Update database ID
                        this.plugin.settings.databaseId = page.id;
                        if (this.dbIdInput) {
                            this.dbIdInput.value = page.id;
                        }
                        await this.plugin.saveSettings();

                        // Clear existing properties
                        this.plugin.settings.enabledProperties = {};

                        // Completely remove any existing properties table
                        const existingPropertiesTable = document.getElementById('properties-table');
                        if (existingPropertiesTable) {
                            existingPropertiesTable.remove();
                        }

                        // Fetch database content
                        const allPages = await fetchNotionData(page.id, this.plugin.settings.apiKey);

                        if (allPages.length === 0) {
                            this.showStatus("This database is empty", "info");
                            return;
                        }

                        // Get the collapsible content element and make sure it's visible
                        if (this.collapsibleContent.style.display !== "block") {
                            this.collapsibleContent.style.display = "block";
                        }

                        // Create new properties table only if we have data
                        if (allPages.length > 0 && this.collapsibleContent) {
                            const exampleProperties = allPages[0].properties as any;

                            // Create new properties table
                            const propertiesTable = this.collapsibleContent.createEl('table', {
                                attr: {
                                    id: 'properties-table',
                                    style: 'width: 100%; border-collapse: collapse; margin-top: 20px;'
                                }
                            });

                            // Add header row
                            const propertiesThead = propertiesTable.createEl('thead');
                            const propertiesHeaderRow = propertiesThead.createEl('tr');
                            propertiesHeaderRow.createEl('th', {
                                text: 'Name',
                                attr: {style: 'padding: 10px; border: 1px solid #ccc;'}
                            });
                            propertiesHeaderRow.createEl('th', {
                                text: 'Type',
                                attr: {style: 'padding: 10px; border: 1px solid #ccc;'}
                            });
                            propertiesHeaderRow.createEl('th', {
                                text: 'Import',
                                attr: {style: 'padding: 10px; border: 1px solid #ccc;'}
                            });

                            // Add properties rows
                            const propertiesTbody = propertiesTable.createEl('tbody');
                            for (const [key, value] of Object.entries(exampleProperties)) {
                                const propertyRow = propertiesTbody.createEl('tr');
                                propertyRow.createEl('td', {
                                    text: key,
                                    attr: {style: 'padding: 10px; border: 1px solid #ccc;'}
                                });
                                propertyRow.createEl('td', {
                                    text: (value as any).type,
                                    attr: {style: 'padding: 10px; border: 1px solid #ccc;'}
                                });
                                const checkboxCell = propertyRow.createEl('td', {attr: {style: 'padding: 10px; border: 1px solid #ccc;'}});
                                const checkbox = checkboxCell.createEl('input', {
                                    attr: {
                                        type: 'checkbox',
                                        checked: this.plugin.settings.enabledProperties[key] ?? true
                                    }
                                });

                                checkbox.addEventListener('change', async (event) => {
                                    const isChecked = (event.target as HTMLInputElement).checked;
                                    this.plugin.settings.enabledProperties[key] = isChecked;
                                    await this.plugin.saveSettings();
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error loading database properties:', error);
                        this.showStatus(`Error loading properties: ${error.message}`, "error");
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            this.showStatus(`Failed to fetch databases: ${error.message}`, "error");
        } finally {
            this.hideLoading();
        }
    }

    private createUI(containerEl: HTMLElement) {
        containerEl.empty();

        containerEl.createEl("h1", {
            text: "VaultMigrate",
            cls: "n2o-main-header"
        });

        containerEl.createEl("p", {
            text: "Migrate your content from Notion to Obsidian",
            cls: "n2o-subtitle"
        });

        // Connection Settings Section
        containerEl.createEl("h2", {
            text: "Notion Connection",
            cls: "n2o-section-header"
        });

        new Setting(containerEl)
            .setName("Notion API Key")
            .setDesc(createFragment(frag => {
                frag.appendText("Your special key to access Notion data. Get it from Notion's integrations page. ");
                frag.createEl("a", {
                    text: "Get your API key",
                    href: "https://www.notion.so/my-integrations",
                    cls: "n2o-link"
                });
            }))
            .addText((text) =>
                text.setValue(this.plugin.settings.apiKey).onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                })
            )
            .addButton(button => button
                .setButtonText("Search DBs")
                .setCta()
                .onClick(() => {
                    this.displayPageList();
                })
            );

        containerEl.createDiv({
            attr: {id: 'page-list-container'}
        });

        // Database Settings Section
        containerEl.createEl("h2", {
            text: "Notion Database",
            cls: "n2o-section-header"
        });

        new Setting(containerEl)
            .setName("Database ID")
            .setDesc("Selected database ID - click on a database above to update")
            .addText((text) => {
                this.dbIdInput = text.inputEl;
                text
                    .setValue(this.plugin.settings.databaseId)
                    .setDisabled(true)
                    .onChange(async (value) => {
                        this.plugin.settings.databaseId = value;
                        await this.plugin.saveSettings();
                    });
            });

        const collapsibleHeader = containerEl.createEl("button", {
            text: "Show Table Properties",
            attr: {class: 'collapsible'}
        });

        collapsibleHeader.addEventListener("click", function () {
            this.classList.toggle("active");
            const content = this.nextElementSibling as HTMLDivElement;
            if (content) {
                content.style.display = content.style.display === "block" ? "none" : "block";
            }
        });

        this.collapsibleContent = containerEl.createEl("div", {
            attr: {class: 'collapsible-content'}
        });

        // Migration Settings Section
        containerEl.createEl("h2", {
            text: "Destination Settings",
            cls: "n2o-section-header"
        });

        new Setting(containerEl)
            .setName("Migration Path")
            .setDesc("Select where to save the migrated notes")
            .addText((text) => {
                text.setValue(this.plugin.settings.migrationPath)
                    .onChange(async (value) => {
                        this.plugin.settings.migrationPath = value;
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName("Attachment Path")
            .setDesc("Select where to save attachments (images, files)")
            .addText((text) => {
                text.setValue(this.plugin.settings.attachmentPath)
                    .onChange(async (value) => {
                        this.plugin.settings.attachmentPath = value;
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName("Subpages Path")
            .setDesc("Select where to save subpages (mandatory)")
            .setClass("setting-item")
            .addText((text) => {
                text.setValue(this.plugin.settings.subpagesPath)
                    .setPlaceholder("subpages")
                    .onChange(async (value) => {
                        if (!value.trim()) {
                            this.showStatus("Subpages path cannot be empty", "error");
                            text.setValue(this.plugin.settings.subpagesPath);
                            return;
                        }
                        this.plugin.settings.subpagesPath = value;
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        // Content Settings Section
        containerEl.createEl("h2", {
            text: "Content Options",
            cls: "n2o-section-header"
        });

        new Setting(containerEl)
            .setName("Create clickable links in content")
            .setDesc("Makes Notion database links work inside your notes. Creates clickable [[Page]] links so you can easily navigate between related notes.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.createRelationContentPage)
                    .onChange(async value => {
                        this.plugin.settings.createRelationContentPage = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Enable Dataview compatibility")
            .setDesc("Makes your notes work with the Dataview plugin. Adds special formatting like 'property:: [[Page]]' so you can create tables and lists of your data.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.createSemanticLinking)
                    .onChange(async value => {
                        this.plugin.settings.createSemanticLinking = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Fix date field names")
            .setDesc("Fixes spaces in date field names to work better with Dataview. Changes names like 'Due Date' to 'DueDate' so they're easier to use in queries.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.squashDateNamesForDataview)
                    .onChange(async value => {
                        this.plugin.settings.squashDateNamesForDataview = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Add unique IDs to filenames")
            .setDesc("Prevents naming conflicts by adding Notion's ID to each filename. This ensures no files get accidentally overwritten when notes have the same name.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.attachPageId)
                    .onChange(async value => {
                        this.plugin.settings.attachPageId = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Import subpages")
            .setDesc("Brings over all the smaller pages inside your Notion pages. When enabled, all linked pages will be imported as separate notes. Otherwise a link to Notion page will be created.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.importSubpages)
                    .onChange(async value => {
                        this.plugin.settings.importSubpages = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Import page content")
            .setDesc("Copies all the text, images, and other content from your Notion pages. If turned off, only the properties will be imported.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.importPageContent)
                    .onChange(async value => {
                        this.plugin.settings.importPageContent = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Migration Log Section
        containerEl.createEl("h2", {
            text: "Migration Log",
            cls: "n2o-section-header"
        });

        const logWindow = containerEl.createEl("textarea", {
            attr: {
                class: "n2o-log-window",
                readonly: "readonly"
            }
        });

        const buttonContainer = containerEl.createDiv({
            cls: 'n2o-button-container'
        });

        const startButton = buttonContainer.createEl("button", {
            text: "Start Migration",
            cls: ["mod-cta", "n2o-start-button"],
        });

        const stopButton = buttonContainer.createEl("button", {
            text: "Stop Migration",
            cls: ["mod-warning", "n2o-stop-button"],
        });

        const clearButton = buttonContainer.createEl("button", {
            text: "Clear Log",
            cls: "mod-warning",
        });

        clearButton.addEventListener("click", () => {
            logWindow.value = "";
            this.plugin.settings.migrationLog = "";
            this.plugin.saveSettings();
        });

        return {logWindow, startButton, stopButton};
    }
}
