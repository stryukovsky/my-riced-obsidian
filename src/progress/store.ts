import { normalizePath, type Vault } from 'obsidian';
import { parseProgress, serializeProgress, type Progress } from './model';

export class ProgressStore {
	private queue: Promise<void> = Promise.resolve();
	readonly path: string;

	constructor(private vault: Vault) {
		this.path = normalizePath(`${vault.configDir}/progress-track.json`);
	}

	async read(): Promise<Progress> {
		if (!await this.vault.adapter.exists(this.path)) return new Map();
		return parseProgress(await this.vault.adapter.read(this.path));
	}

	update(change: (progress: Progress) => void): Promise<void> {
		const operation = this.queue.then(async () => {
			// Re-read so another device's synced progress is not replaced by a stale cache.
			const progress = await this.read();
			const before = serializeProgress(progress);
			change(progress);
			const after = serializeProgress(progress);
			if (after !== before) await this.vault.adapter.write(this.path, after);
		});
		this.queue = operation.catch(() => {});
		return operation;
	}

	async latest(): Promise<Progress> {
		await this.queue;
		return this.read();
	}
}
