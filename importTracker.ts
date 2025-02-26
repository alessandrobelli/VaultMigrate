export class ImportTracker {
	private totalItems: number = 0;
	private processedItems: number = 0;
	private itemsByType: {
		attachments: { total: number, completed: number, failed: number },
		subpages: { total: number, completed: number, failed: number }
	} = {
		attachments: {total: 0, completed: 0, failed: 0},
		subpages: {total: 0, completed: 0, failed: 0}
	};

	private itemsMap: Map<string, {
		parentPage: string,
		status: 'pending' | 'success' | 'error',
		type: 'attachment' | 'subpage',
		subtype?: 'image' | 'audio' | 'file' | 'video',
		error?: string
	}> = new Map();

	private ui: {
		container: HTMLElement;
		stats: HTMLElement;
		progressFill: HTMLElement;
		progressText: HTMLElement;
		log: HTMLElement;
	};

	private logMessageCallback: (message: string) => void;

	constructor(ui: any, logCallback: (message: string) => void) {
		this.ui = ui;
		this.logMessageCallback = logCallback;
	}

	public startTracking(itemCount?: number) {
		this.totalItems = itemCount || 0;
		this.processedItems = 0;
		this.itemsMap.clear();
		this.itemsByType = {
			attachments: {total: 0, completed: 0, failed: 0},
			subpages: {total: 0, completed: 0, failed: 0}
		};

		this.ui.container.style.display = 'block';
		this.updateUI();
	}

	public stopTracking() {
		this.ui.container.style.display = 'none';
	}

	public addItem(id: string, parentPage: string, type: 'attachment' | 'subpage', subtype?: 'image' | 'audio' | 'file' | 'video') {
		console.log(`Tracker: Adding ${type} item: ${id} from page ${parentPage}`);
		this.itemsMap.set(id, {
			parentPage,
			status: 'pending',
			type,
			subtype
		});

		// Update type-specific counters
		if (type === 'attachment') {
			this.itemsByType.attachments.total++;
		} else if (type === 'subpage') {
			this.itemsByType.subpages.total++;
		}

		this.totalItems = this.itemsMap.size;
		this.logItem(id, 'pending');
		this.updateUI();
	}

	public markItemComplete(id: string, success: boolean, errorMessage?: string) {
		console.log(`Tracker: Completing ${success ? 'successfully' : 'with error'}: ${id}`);
		const item = this.itemsMap.get(id);
		if (item) {
			item.status = success ? 'success' : 'error';
			if (errorMessage) {
				item.error = errorMessage;
			}

			this.processedItems++;

			// Update type-specific completed counters
			if (item.type === 'attachment') {
				if (success) {
					this.itemsByType.attachments.completed++;
				} else {
					this.itemsByType.attachments.failed++;
				}
			} else if (item.type === 'subpage') {
				if (success) {
					this.itemsByType.subpages.completed++;
				} else {
					this.itemsByType.subpages.failed++;
				}
			}

			this.logItem(id, item.status);
			this.updateUI();
		}
	}

	private updateUI() {
		// Calculate totals
		const totalAttachments = this.itemsByType.attachments.total;
		const completedAttachments = this.itemsByType.attachments.completed;
		const failedAttachments = this.itemsByType.attachments.failed;

		const totalSubpages = this.itemsByType.subpages.total;
		const completedSubpages = this.itemsByType.subpages.completed;
		const failedSubpages = this.itemsByType.subpages.failed;

		// Update stats in header
		this.ui.stats.setText(
			`${this.processedItems}/${this.totalItems} items processed • ` +
			`Attachments: ${completedAttachments}/${totalAttachments} • ` +
			`Subpages: ${completedSubpages}/${totalSubpages}`
		);

		// Update progress bar
		const percentage = this.totalItems > 0 ? Math.round((this.processedItems / this.totalItems) * 100) : 0;
		this.ui.progressFill.style.width = `${percentage}%`;
		this.ui.progressText.setText(`${percentage}%`);

		// Log summary message at certain thresholds
		if (this.processedItems % 10 === 0 && this.processedItems > 0) {
			this.logMessageCallback(
				`Progress: ${this.processedItems}/${this.totalItems} items (${percentage}%) • ` +
				`Processed ${completedAttachments} attachments (${failedAttachments} failed) and ` +
				`${completedSubpages} subpages (${failedSubpages} failed)`
			);
		}
	}

	private logItem(id: string, status: 'pending' | 'success' | 'error') {
		const item = this.itemsMap.get(id);
		if (!item) return;

		const existingItem = document.getElementById(`import-item-${this.sanitizeId(id)}`);

		if (existingItem) {
			existingItem.className = `import-details-item ${status}`;
			existingItem.innerHTML = this.getItemHTML(id, item, status);
		} else {
			const itemElement = document.createElement('div');
			itemElement.id = `import-item-${this.sanitizeId(id)}`;
			itemElement.className = `import-details-item ${status}`;
			itemElement.innerHTML = this.getItemHTML(id, item, status);

			// Add to beginning of log to show newest first
			this.ui.log.prepend(itemElement);

			// Limit to showing 100 items to prevent performance issues
			if (this.ui.log.children.length > 100) {
				this.ui.log.removeChild(this.ui.log.lastChild);
			}
		}
	}

	private sanitizeId(id: string): string {
		// Create a safe ID for DOM elements by removing special characters
		return id.replace(/[^a-zA-Z0-9]/g, '_');
	}

	private getItemHTML(id: string, item: any, status: string) {
		const filename = id.split('/').pop();

		// Choose appropriate icon based on file type
		let icon = '📄'; // Default
		if (item.type === 'attachment') {
			if (item.subtype === 'image') icon = '🖼️';
			else if (item.subtype === 'audio') icon = '🔊';
			else if (item.subtype === 'video') icon = '🎬';
			else icon = '📎';
		} else if (item.type === 'subpage') {
			icon = '📑';
		}

		const statusIcon = status === 'pending' ? '⏳' : status === 'success' ? '✅' : '❌';

		let html = `
            <span class="import-details-icon">${statusIcon} ${icon}</span>
            <span>${item.type === 'attachment' ? 'File: ' : 'Subpage: '} ${filename}</span>
            <small> (in ${item.parentPage})</small>
        `;

		// Add error message if there is one
		if (status === 'error' && item.error) {
			html += `<div class="import-details-error"><small>Error: ${item.error}</small></div>`;
		}

		return html;
	}
}
