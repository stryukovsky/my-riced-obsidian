import { FuzzySuggestModal, Notice, type App, type TFile } from 'obsidian';

export interface ContinueItem {
	folder: string;
	file: TFile;
}

export class ContinuePicker extends FuzzySuggestModal<ContinueItem> {
	constructor(app: App, private items: ContinueItem[]) {
		super(app);
		this.setPlaceholder('Select a tracked folder to continue reading');
	}

	getItems(): ContinueItem[] { return this.items; }
	getItemText(item: ContinueItem): string {
		return `${item.folder === '/' ? 'Vault root' : item.folder} — ${item.file.name}`;
	}

	onChooseItem(item: ContinueItem): void {
		void this.app.workspace.getLeaf(false).openFile(item.file).catch(error => {
			console.error('Could not open saved file', error);
			new Notice('Could not open the saved file. It may have moved or been deleted.');
		});
	}
}
