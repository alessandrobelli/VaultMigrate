import { App, Plugin } from "obsidian";
import { NotionMigrationSettingTab } from "./ui/NotionMigrationSettingTab";
import { NotionMigrationSettings, DEFAULT_SETTINGS } from "./interfaces/PluginSettings";
import { ImportControl } from "./interfaces/NotionTypes";

export default class NotionMigrationPlugin extends Plugin {
    settings: NotionMigrationSettings;
    importControl: ImportControl = {
        isImporting: false,
        forceStop: false
    };
    statusBarItem: HTMLElement;
    
    // Animation for status text
    private statusAnimationInterval: number | null = null;
    private animationDots = 0;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new NotionMigrationSettingTab(this.app, this));
        
        // Create the status bar item (initially hidden)
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('notion-import-status');
        this.statusBarItem.style.display = 'none';
    }
    
    async onunload() {
        // Clean up status bar and any running animations
        this.stopStatusAnimation();
        if (this.statusBarItem) {
            this.statusBarItem.remove();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    getApp(): App {
        return this.app;
    }

    // Method to show the import status in the status bar
    showImportStatus() {
        this.statusBarItem.setText('Migrating content from Notion');
        this.statusBarItem.style.display = 'block';
        // Create animation effect for the text
        this.startStatusAnimation();
    }

    // Method to hide the import status from the status bar
    hideImportStatus() {
        this.statusBarItem.style.display = 'none';
        // Stop animation if it exists
        this.stopStatusAnimation();
    }

    private startStatusAnimation() {
        // Clear any existing animation
        this.stopStatusAnimation();
        
        // Start a new animation
        this.statusAnimationInterval = window.setInterval(() => {
            this.animationDots = (this.animationDots % 3) + 1;
            const dots = '.'.repeat(this.animationDots);
            this.statusBarItem.setText(`Migrating content from Notion${dots}`);
        }, 500); // Update every 500ms
    }

    private stopStatusAnimation() {
        if (this.statusAnimationInterval) {
            clearInterval(this.statusAnimationInterval);
            this.statusAnimationInterval = null;
        }
    }
}