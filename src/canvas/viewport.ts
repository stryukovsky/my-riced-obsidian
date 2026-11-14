// Canvas has no public viewport API. Keep all assumptions about its internals here.
export interface CanvasViewport {
	wrapperEl: HTMLElement;
	canvasRect?: { width: number; height: number };
	scale?: number;
	zoom: number;
	tx: number;
	ty: number;
	tZoom: number;
	zoomCenter: unknown;
	isDragging?: boolean;
	selection?: Set<{ isEditing?: boolean }>;
	markViewportChanged(): void;
}

export function asViewport(value: unknown): CanvasViewport | null {
	if (!value || typeof value !== 'object') return null;
	const canvas = value as Partial<CanvasViewport>;
	if (!canvas.wrapperEl?.ownerDocument || typeof canvas.markViewportChanged !== 'function' ||
		![canvas.tx, canvas.ty, canvas.zoom, canvas.tZoom].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
	return canvas as CanvasViewport;
}

interface Animation {
	x: number;
	y: number;
	zoom: number;
	frame: number;
	lastTime: number;
	win: Window;
}

export class ViewportAnimator {
	private animations = new Map<CanvasViewport, Animation>();

	move(canvas: CanvasViewport, x: number, y: number, zoom: number): void {
		const win = canvas.wrapperEl.ownerDocument.defaultView;
		if (!win) return;
		let state = this.animations.get(canvas);
		if (!state) {
			state = { x: canvas.tx, y: canvas.ty, zoom: canvas.tZoom, frame: 0, lastTime: 0, win };
			this.animations.set(canvas, state);
		}
		state.x += x;
		state.y += y;
		state.zoom = Math.max(-4, Math.min(1, state.zoom + zoom));
		if (!state.frame) state.frame = win.requestAnimationFrame(time => this.step(canvas, time));
	}

	private step(canvas: CanvasViewport, time: number): void {
		const state = this.animations.get(canvas);
		if (!state) return;
		if (!canvas.wrapperEl.isConnected || canvas.isDragging) { this.stop(canvas); return; }
		const dt = state.lastTime ? Math.min(0.05, (time - state.lastTime) / 1000) : 1 / 60;
		state.lastTime = time;
		const done = Math.hypot(state.x - canvas.tx, state.y - canvas.ty) * Math.pow(2, canvas.zoom) < 0.5 &&
			Math.abs(state.zoom - canvas.tZoom) < 0.001;
		const fraction = done ? 1 : 1 - Math.exp(-18 * dt);
		canvas.tx += (state.x - canvas.tx) * fraction;
		canvas.ty += (state.y - canvas.ty) * fraction;
		canvas.tZoom += (state.zoom - canvas.tZoom) * fraction;
		canvas.zoomCenter = null;
		canvas.markViewportChanged();
		if (done) { this.stop(canvas); return; }
		state.frame = state.win.requestAnimationFrame(now => this.step(canvas, now));
	}

	stop(canvas: CanvasViewport): void {
		const state = this.animations.get(canvas);
		if (state) state.win.cancelAnimationFrame(state.frame);
		this.animations.delete(canvas);
	}

	stopAll(): void {
		for (const canvas of this.animations.keys()) this.stop(canvas);
	}
}
