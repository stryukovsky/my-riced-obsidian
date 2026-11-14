import { Plugin } from 'obsidian';
import { ProgressTracker } from './progress/tracker';
import { CanvasNavigation } from './canvas/navigation';

export default class RicedObsidian extends Plugin {
	async onload(): Promise<void> {
		const tracker = new ProgressTracker(this);
		await tracker.load();
		tracker.register();
		new CanvasNavigation(this).register();
	}
}
