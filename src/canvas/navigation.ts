import { View, type Plugin } from 'obsidian';
import { motionForKey, type Motion } from './keys';
import { asViewport, ViewportAnimator, type CanvasViewport } from './viewport';

export class CanvasNavigation {
	private animator = new ViewportAnimator();
	private windows = new WeakSet<Window>();

	constructor(private plugin: Plugin) {}

	register(): void {
		this.bindWindow(window);
		this.plugin.app.workspace.iterateAllLeaves(leaf => {
			const win = leaf.view.containerEl.ownerDocument.defaultView;
			if (win) this.bindWindow(win);
		});
		this.plugin.registerEvent(this.plugin.app.workspace.on('window-open', (_workspaceWindow, win) => this.bindWindow(win)));
		this.plugin.registerEvent(this.plugin.app.workspace.on('active-leaf-change', () => this.animator.stopAll()));
		this.plugin.register(() => this.animator.stopAll());
		const commands: { id: string; name: string; motion: Motion }[] = [
			{ id: 'canvas-pan-left', name: 'Pan canvas left', motion: { x: -1, y: 0, zoom: 0 } },
			{ id: 'canvas-pan-down', name: 'Pan canvas down', motion: { x: 0, y: 1, zoom: 0 } },
			{ id: 'canvas-pan-up', name: 'Pan canvas up', motion: { x: 0, y: -1, zoom: 0 } },
			{ id: 'canvas-pan-right', name: 'Pan canvas right', motion: { x: 1, y: 0, zoom: 0 } },
			{ id: 'canvas-zoom-in', name: 'Zoom canvas in', motion: { x: 0, y: 0, zoom: 1 } },
			{ id: 'canvas-zoom-out', name: 'Zoom canvas out', motion: { x: 0, y: 0, zoom: -1 } },
		];
		for (const command of commands) {
			this.plugin.addCommand({
				id: command.id, name: command.name, repeatable: true,
				checkCallback: checking => {
					const canvas = this.activeCanvas();
					if (!canvas || !this.canNavigate(canvas)) return false;
					if (!checking) this.move(canvas, command.motion);
					return true;
				},
			});
		}
	}

	private bindWindow(win: Window): void {
		if (this.windows.has(win)) return;
		this.windows.add(win);
		this.plugin.registerDomEvent(win, 'keydown', event => {
			const motion = motionForKey(event);
			if (!motion || event.defaultPrevented) return;
			const canvas = this.activeCanvas();
			if (!canvas || canvas.wrapperEl.ownerDocument !== win.document || !this.canNavigate(canvas)) return;
			// Do not steal keys from sidebars, search fields, or other panes.
			const target = event.composedPath()[0];
			if (target !== win.document.body && (!target || !canvas.wrapperEl.contains(target as Node))) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			this.move(canvas, motion);
		}, { capture: true });
		// Cancel our glide, but leave all native pointer and wheel behavior unchanged.
		this.plugin.registerDomEvent(win, 'pointerdown', () => this.animator.stopAll(), { capture: true });
		this.plugin.registerDomEvent(win, 'wheel', () => this.animator.stopAll(), { passive: true, capture: true });
		this.plugin.registerDomEvent(win, 'blur', () => this.animator.stopAll());
	}

	private activeCanvas(): CanvasViewport | null {
		const view = this.plugin.app.workspace.getActiveViewOfType(View);
		if (view?.getViewType() !== 'canvas') return null;
		return asViewport((view as View & { canvas?: unknown }).canvas);
	}

	private canNavigate(canvas: CanvasViewport): boolean {
		const doc = canvas.wrapperEl.ownerDocument;
		if (canvas.isDragging || doc.querySelector('.modal-container, .prompt')) return false;
		const active = doc.activeElement;
		if (active?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor')) return false;
		for (const item of canvas.selection ?? []) if (item.isEditing) return false;
		return true;
	}

	private move(canvas: CanvasViewport, motion: Motion): void {
		const scale = canvas.scale || Math.pow(2, canvas.zoom);
		const width = canvas.canvasRect?.width || canvas.wrapperEl.clientWidth;
		const height = canvas.canvasRect?.height || canvas.wrapperEl.clientHeight;
		this.animator.move(canvas, motion.x * width * 0.2 / scale, motion.y * height * 0.2 / scale, motion.zoom * 0.25);
	}
}
