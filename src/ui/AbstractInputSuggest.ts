// Credits:
// This implementation is based on the AbstractInputSuggest from the Obsidian API
// and additional concepts from various community plugins like Templater
// (https://github.com/SilentVoid13/Templater) and Dataview
// (https://github.com/blacksmithgu/obsidian-dataview)

import { App, TAbstractFile, TFolder } from "obsidian";

// Generic wrapper to handle input suggestions
export abstract class AbstractInputSuggest<T> {
    protected app: App;
    protected inputEl: HTMLInputElement | HTMLTextAreaElement;
    protected suggestEl: HTMLElement;
    protected suggestions: T[];
    protected selectedIndex: number;
    protected resolvePromise: (value: T | null) => void;

    constructor(app: App, inputEl: HTMLInputElement | HTMLTextAreaElement) {
        this.app = app;
        this.inputEl = inputEl;
        this.suggestions = [];
        this.selectedIndex = 0;

        // Create suggestion container
        this.suggestEl = createDiv("n2o-suggestion-container");
        this.suggestEl.style.display = "none";
        document.body.appendChild(this.suggestEl);

        // Add event listeners
        this.inputEl.addEventListener("input", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("focus", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("blur", this.close.bind(this));
        this.inputEl.addEventListener("keydown", this.onKeyDown.bind(this));

        // Prevent clicks inside suggestion container from removing focus
        this.suggestEl.addEventListener("mousedown", (event: MouseEvent) => {
            event.preventDefault();
        });
    }

    onInputChanged(): void {
        const inputValue = this.inputEl.value;
        const suggestions = this.getSuggestions(inputValue);

        if (!suggestions || suggestions.length === 0) {
            this.close();
            return;
        }

        this.suggestions = suggestions;
        this.selectedIndex = 0;
        this.updateSuggestions();
        this.open();
    }

    onKeyDown(event: KeyboardEvent): void {
        if (!this.suggestEl || this.suggestEl.style.display === "none") return;

        switch (event.key) {
            case "ArrowUp":
                event.preventDefault();
                this.selectedIndex = (this.selectedIndex - 1 + this.suggestions.length) % this.suggestions.length;
                this.updateSuggestions();
                break;
            case "ArrowDown":
                event.preventDefault();
                this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
                this.updateSuggestions();
                break;
            case "Enter":
                event.preventDefault();
                this.selectSuggestion(this.suggestions[this.selectedIndex]);
                break;
            case "Escape":
                event.preventDefault();
                this.close();
                break;
        }
    }

    updateSuggestions(): void {
        this.suggestEl.empty();

        const suggestionItems: HTMLElement[] = [];

        this.suggestions.forEach((suggestion, i) => {
            const suggestionEl = this.suggestEl.createDiv("n2o-suggestion-item");
            if (i === this.selectedIndex) {
                suggestionEl.addClass("active");
            }
            
            this.renderSuggestion(suggestion, suggestionEl);
            
            // Handle clicks on suggestions
            suggestionEl.addEventListener("click", () => {
                this.selectSuggestion(suggestion);
            });
            
            // Handle hover
            suggestionEl.addEventListener("mouseenter", () => {
                this.selectedIndex = i;
                this.updateSuggestions();
            });

            suggestionItems.push(suggestionEl);
        });
    }

    open(): void {
        if (this.suggestions.length === 0) return;

        this.suggestEl.style.display = "block";
        this.suggestEl.style.width = this.inputEl.clientWidth + "px";

        // Position the suggestion box right below the input element
        const rect = this.inputEl.getBoundingClientRect();
        this.suggestEl.style.left = rect.left + "px";
        this.suggestEl.style.top = rect.bottom + "px";
    }

    close(): void {
        this.suggestEl.style.display = "none";
    }

    // These methods must be implemented by the extending class
    abstract getSuggestions(inputStr: string): T[];
    abstract renderSuggestion(item: T, el: HTMLElement): void;
    abstract selectSuggestion(item: T): void;
}

// Folder suggestion implementation
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((folder: TAbstractFile) => {
            if (folder instanceof TFolder && folder.path.toLowerCase().contains(lowerCaseInputStr)) {
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
