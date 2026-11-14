import { Notice, setIcon, setTooltip, TFile, type Plugin } from 'obsidian';
import { parentPath, renameProgress } from './model';
import { ContinuePicker, type ContinueItem } from './picker';
import { ProgressStore } from './store';

export class ProgressTracker {
	private store: ProgressStore;
	private ribbon!: HTMLElement;
	private stopped = false;

	constructor(private plugin: Plugin) {
		this.store = new ProgressStore(plugin.app.vault);
	}

	async load(): Promise<void> {
		try { await this.store.read(); }
		catch (error) { this.report(error); }
	}

	register(): void {
		const { plugin } = this;
		this.ribbon = plugin.addRibbonIcon('folder-heart', 'Track current folder', () => {
			void this.toggle();
		});
		plugin.addRibbonIcon('book-open', 'Continue reading', () => { void this.continue(); });
		plugin.addCommand({ id: 'toggle-folder-tracking', name: 'Track or untrack current folder', callback: () => this.toggle() });
		plugin.addCommand({ id: 'continue-reading', name: 'Continue reading', callback: () => this.continue() });
		plugin.registerEvent(plugin.app.workspace.on('file-open', file => {
			void this.record(file);
		}));
		plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
			void this.update(progress => renameProgress(progress, oldPath, file.path));
		}));
		plugin.registerEvent(plugin.app.vault.on('delete', file => {
			void this.update(progress => {
				for (const folder of progress.keys()) {
					if (folder === file.path || folder.startsWith(file.path + '/')) progress.delete(folder);
				}
			});
		}));
		plugin.register(() => { this.stopped = true; });
		plugin.app.workspace.onLayoutReady(() => {
			if (!this.stopped) void this.record(plugin.app.workspace.getActiveFile());
		});
	}

	private async record(file: TFile | null): Promise<void> {
		await this.update(progress => {
			if (file && progress.has(parentPath(file.path))) progress.set(parentPath(file.path), file.path);
		});
	}

	private async update(change: Parameters<ProgressStore['update']>[0]): Promise<void> {
		try {
			await this.store.update(change);
			await this.refreshRibbon();
		} catch (error) { this.report(error); }
	}

	private async refreshRibbon(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		const progress = await this.store.latest();
		if (this.stopped) return;
		const tracked = !!file && progress.has(parentPath(file.path));
		this.ribbon.toggleClass('is-active', tracked);
		this.ribbon.setAttribute('aria-pressed', String(tracked));
		setIcon(this.ribbon, tracked ? 'folder-check' : 'folder-heart');
		setTooltip(this.ribbon, tracked ? 'Untrack current folder' : 'Track current folder');
	}

	private async toggle(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) { new Notice('Open a file first to track its folder.'); return; }
		const folder = parentPath(file.path);
		try {
			let tracked = false;
			await this.store.update(progress => {
				if (progress.has(folder)) progress.delete(folder);
				else { progress.set(folder, file.path); tracked = true; }
			});
			new Notice(`${tracked ? 'Started' : 'Stopped'} tracking progress in ${folder === '/' ? 'vault root' : folder}.`);
			await this.refreshRibbon();
		} catch (error) { this.report(error); }
	}

	private async continue(): Promise<void> {
		try {
			const progress = await this.store.latest();
			const items: ContinueItem[] = [];
			for (const [folder, path] of progress) {
				const file = this.plugin.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) items.push({ folder, file });
			}
			if (!items.length) {
				new Notice(progress.size ? 'Saved files are missing. Open another file in a tracked folder to update progress.' : 'No tracked folders yet. Open a file and select Track current folder.');
				return;
			}
			new ContinuePicker(this.plugin.app, items.sort((a, b) => a.folder.localeCompare(b.folder))).open();
		} catch (error) { this.report(error); }
	}

	private report(error: unknown): void {
		console.error('Could not access reading progress', error);
		new Notice('Could not read or save progress-track.json. Check the file and vault permissions; existing data was not overwritten.');
	}
}
