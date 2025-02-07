import {App, FuzzySuggestModal, Plugin, PluginSettingTab, Setting, TFolder, Notice} from "obsidian";
import {fetchNotionData, getDatabaseName} from "./notionHandling";
import {createMarkdownFiles} from "./markdownCreation";
import fs from "fs";
import tippy from 'tippy.js';
import {TextInputSuggest} from "./suggest";

export class FolderSuggest extends TextInputSuggest<TFolder> {
    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = app.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((folder: TAbstractFile) => {
            if (
                folder instanceof TFolder &&
                folder.path.toLowerCase().contains(lowerCaseInputStr)
            ) {
                folders.push(folder);
            }
        });

        return folders;
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFolder): void {
        this.inputEl.value = file.path;
        this.inputEl.trigger("input");
        this.close();
    }
}

interface NotionMigrationSettings {
    apiKey: string;
    databaseId: string;
    migrationPath: string;
    migrationLog: string;
    attachmentPath: string;
    attachPageId: boolean;
    importPageContent: boolean;
    isImporting: boolean;
    createRelationContentPage: boolean;
    createSemanticLinking: boolean;
    squashDateNamesForDataview: boolean;
    enabledProperties: { [key: string]: boolean };
}

const DEFAULT_SETTINGS: NotionMigrationSettings = {
    apiKey: "",
    databaseId: "",
    migrationPath: "",
    migrationLog: "",
    attachmentPath: "",
    attachPageId: false,
    importPageContent: true,
    isImporting: false,
    createRelationContentPage: true,
    enabledProperties: {},
    createSemanticLinking: true,
    squashDateNamesForDataview: true,
};

export default class NotionMigrationPlugin extends Plugin {
    settings: NotionMigrationSettings;
    importControl = {
        isImporting: false
    };

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new NotionMigrationSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class NotionMigrationSettingTab extends PluginSettingTab {
    plugin: NotionMigrationPlugin;
    collapsibleContent: HTMLElement;
    loadingEl: HTMLElement;
    statusEl: HTMLElement;

    constructor(app: App, plugin: NotionMigrationPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private activeNotice: Notice | null = null;  

    showLoading(message: string) {
        if (this.activeNotice) {
            this.activeNotice.hide();
        }
        this.activeNotice = new Notice(message, 5000); // 5 second timeout
        return this.activeNotice;
    }
    
    hideLoading(notice: Notice) {
        if (notice) {
            notice.hide();
        }
    }
    
    showStatus(message: string, type: 'success' | 'error' | 'info' = 'info') {
        const duration = type === 'error' ? 10000 : 3000;
        new Notice(message, duration);
    }

    private listAllDirectories(): TFolder[] {
        const vaultPath = this.app.vault.adapter.basePath;
        const directories = [];

        const items = fs.readdirSync(vaultPath, {withFileTypes: true});
        for (const item of items) {
            if (item.isDirectory()) {
                const folder = this.app.vault.getAbstractFileByPath(item.name);
                if (folder instanceof TFolder) {
                    directories.push(folder);
                }
            }
        }

        return directories;
    }

    // Declare a variable to hold the text input element for Database ID
    dbIdInput: HTMLInputElement;

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
                stopButton.disabled = false;
                startButton.textContent = "Migrating...";
                startButton.disabled = true;

                const logMessage = (message) => {
                    logWindow.value += `${message}\n`;
                    logWindow.scrollTop = logWindow.scrollHeight;
                    this.plugin.settings.migrationLog = logWindow.value;
                    this.plugin.saveSettings();
                };

                const dbName = await getDatabaseName(this.plugin.settings.apiKey, this.plugin.settings.databaseId);
                if (dbName) {
                    logMessage(`Starting migration from Notion database: ${dbName}`);
                } else {
                    logMessage("Starting migration from Notion...");
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
                );
                logMessage("Migration completed!");
                this.showStatus("Migration completed successfully!", "success");
            } catch (error) {
                logWindow.value += `Error: ${error.message}\n`;
                this.showStatus(`Migration failed: ${error.message}`, "error");
            } finally {
                this.hideLoading();
                startButton.textContent = "Start Migration";
                this.plugin.settings.isImporting = false;
                await this.plugin.saveSettings();
                startButton.disabled = false;
            }
        });

        stopButton.addEventListener("click", async () => {
            this.plugin.settings.isImporting = false;
            this.plugin.importControl.isImporting = false;
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
                text: 'Click on the row to update database ID. Hover to check properties.',
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
                for (const [key, value] of Object.entries(page.properties || {})) {
                    propertiesText += `${key} - ${value.type} <br>`;
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
                    const loadingIndicator = document.createElement('div');
                    loadingIndicator.innerHTML = 'Loading properties...';
                    loadingIndicator.style.position = 'absolute';
                    loadingIndicator.style.top = '50%';
                    loadingIndicator.style.left = '50%';
                    loadingIndicator.style.transform = 'translate(-50%, -50%)';
                    loadingIndicator.style.zIndex = '10';
                    loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                    loadingIndicator.style.color = 'white';
                    loadingIndicator.style.padding = '15px';
                    loadingIndicator.style.borderRadius = '5px';

                    tableWrapper.appendChild(loadingIndicator);
                    this.plugin.settings.databaseId = page.id;
                    if (this.dbIdInput) {
                        this.dbIdInput.value = page.id;
                    }
                    await this.plugin.saveSettings();
                    this.plugin.settings.enabledProperties = {};

                    const allPages = await fetchNotionData(page.id, this.plugin.settings.apiKey);

                    tableWrapper.removeChild(loadingIndicator);
                    if (allPages.length === 0) {
                        this.showStatus("This database is empty", "info");
                        return;
                    }

                    
                    
                    if (allPages.length > 0) {
                        const exampleProperties = allPages[0].properties;

                        const existingPropertiesTable = document.getElementById('properties-table');
                        if (existingPropertiesTable) {
                            existingPropertiesTable.remove();
                        }

                        const propertiesTable = this.collapsibleContent.createEl('table', {
                            attr: {
                                id: 'properties-table',
                                style: 'width: 100%; border-collapse: collapse; margin-top: 20px;'
                            }
                        });

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

                        const propertiesTbody = propertiesTable.createEl('tbody');
                        for (const [key, value] of Object.entries(exampleProperties)) {
                            const propertyRow = propertiesTbody.createEl('tr');
                            propertyRow.createEl('td', {
                                text: key,
                                attr: {style: 'padding: 10px; border: 1px solid #ccc;'}
                            });
                            propertyRow.createEl('td', {
                                text: value.type,
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
            text: "Notion to Obsidian Migration",
            cls: "n2o-main-header"
        });
    
        // Connection Settings Section
        containerEl.createEl("h2", {
            text: "Connection Settings",
            cls: "n2o-section-header"
        });
    
        new Setting(containerEl)
            .setName("Notion API Key")
            .setDesc(createFragment(frag => {
                frag.appendText("Enter your Notion API key here. ");
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
            text: "Database Settings",
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
            const content = this.nextElementSibling;
            if (content.style.display === "block") {
                content.style.display = "none";
            } else {
                content.style.display = "block";
            }
        });
    
        this.collapsibleContent = containerEl.createEl("div", {
            attr: {class: 'collapsible-content'}
        });
    
        // Migration Settings Section
        containerEl.createEl("h2", {
            text: "Migration Settings",
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
                new FolderSuggest(text.inputEl);
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
                new FolderSuggest(text.inputEl);
            });
    
        // Content Settings Section
        containerEl.createEl("h2", {
            text: "Content Settings",
            cls: "n2o-section-header"
        });
    
        new Setting(containerEl)
            .setName("Create relations also inside the page")
            .setDesc("Creates clickable links ([[Page]]) both in frontmatter and note body. Useful for graph view and navigation.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.createRelationContentPage)
                    .onChange(async value => {
                        this.plugin.settings.createRelationContentPage = value;
                        await this.plugin.saveSettings();
                    })
            );
    
        new Setting(containerEl)
            .setName("Create Semantic Linking")
            .setDesc("Creates Dataview-compatible links (property:: [[Page]]). Enable if you use Dataview plugin.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.createSemanticLinking)
                    .onChange(async value => {
                        this.plugin.settings.createSemanticLinking = value;
                        await this.plugin.saveSettings();
                    })
            );
    
        new Setting(containerEl)
            .setName("Squash Date Names")
            .setDesc("Converts multi-word date fields (e.g., 'Due Date') to camelCase ('DueDate') for Dataview compatibility.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.squashDateNamesForDataview)
                    .onChange(async value => {
                        this.plugin.settings.squashDateNamesForDataview = value;
                        await this.plugin.saveSettings();
                    })
            );
    
        new Setting(containerEl)
            .setName("Attach page ID")
            .setDesc("Adds Notion's page ID to filenames to prevent conflicts. Example: 'Note_7b8b0713'")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.attachPageId)
                    .onChange(async value => {
                        this.plugin.settings.attachPageId = value;
                        await this.plugin.saveSettings();
                    })
            );
    
        new Setting(containerEl)
            .setName("Import page content")
            .setDesc("Choose whether to import the content of the pages from Notion.")
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