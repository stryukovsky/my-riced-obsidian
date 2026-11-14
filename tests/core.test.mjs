import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

async function load(entry) {
	const result = await build({
		entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node',
		plugins: [{ name: 'obsidian-test', setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
			builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const normalizePath = path => path.replace(/\\\\/g, "/"); export class View {}' }));
		} }],
	});
	return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}

const model = await load('src/progress/model.ts');
const { ProgressStore } = await load('src/progress/store.ts');
const { motionForKey } = await load('src/canvas/keys.ts');
const { ViewportAnimator, asViewport } = await load('src/canvas/viewport.ts');
const { CanvasNavigation } = await load('src/canvas/navigation.ts');

test('progress round-trips root, nested folders, and special object keys', () => {
	const progress = new Map([['/', 'root.md'], ['Books/A', 'Books/A/chapter.md'], ['__proto__', '__proto__/note.md']]);
	assert.deepEqual(model.parseProgress(model.serializeProgress(progress)), progress);
	assert.equal(model.parentPath('Books/A/chapter.md'), 'Books/A');
	assert.equal(model.parentPath('root.md'), '/');
});

test('malformed and unsafe progress is rejected, not silently reset', () => {
	for (const value of ['{', 'null', '{}', '{"version":2,"folders":{}}',
		'{"version":1,"folders":{"A":"B/file.md"}}',
		'{"version":1,"folders":{"..":"../file.md"}}']) {
		assert.throws(() => model.parseProgress(value));
	}
});

test('folder and file renames preserve progress', () => {
	const progress = new Map([['Books/A', 'Books/A/chapter.md'], ['Other', 'Other/note.md']]);
	model.renameProgress(progress, 'Books', 'Reading');
	assert.equal(progress.get('Reading/A'), 'Reading/A/chapter.md');
	model.renameProgress(progress, 'Reading/A/chapter.md', 'Reading/A/renamed.md');
	assert.equal(progress.get('Reading/A'), 'Reading/A/renamed.md');
	assert.equal(progress.get('Other'), 'Other/note.md');
});

function storage(initial) {
	let text = initial;
	let writes = 0;
	const store = new ProgressStore({ configDir: '.custom', adapter: {
		exists: async () => text !== undefined,
		read: async () => text,
		write: async (_path, value) => { text = value; writes++; },
	} });
	return { store, text: () => text, writes: () => writes, external: value => { text = value; } };
}

test('storage serializes concurrent updates and avoids unchanged writes', async () => {
	const db = storage();
	assert.equal(db.store.path, '.custom/progress-track.json');
	await Promise.all([
		db.store.update(p => p.set('A', 'A/one.md')),
		db.store.update(p => p.set('B', 'B/two.md')),
	]);
	assert.equal((await db.store.latest()).size, 2);
	await db.store.update(() => {});
	assert.equal(db.writes(), 2);
});

test('storage re-reads synced data and does not overwrite corrupt files', async () => {
	const db = storage(model.serializeProgress(new Map([['A', 'A/one.md']])));
	await db.store.latest();
	db.external(model.serializeProgress(new Map([['B', 'B/two.md']])));
	await db.store.update(p => p.set('C', 'C/three.md'));
	assert.deepEqual([...await db.store.latest()], [['B', 'B/two.md'], ['C', 'C/three.md']]);
	db.external('{broken');
	await assert.rejects(db.store.update(p => p.clear()));
	assert.equal(db.text(), '{broken');
	// A failed operation must not poison the write queue.
	db.external(model.serializeProgress(new Map()));
	await db.store.update(p => p.set('A', 'A/recovered.md'));
	assert.equal((await db.store.latest()).get('A'), 'A/recovered.md');
});

const key = (key, extra = {}) => ({ key, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...extra });
test('requested navigation keys map correctly', () => {
	for (const [letter, russian, arrow, x, y] of [['h', 'р', 'ArrowLeft', -1, 0], ['j', 'о', 'ArrowDown', 0, 1], ['k', 'л', 'ArrowUp', 0, -1], ['l', 'д', 'ArrowRight', 1, 0]]) {
		for (const ctrlKey of [false, true]) {
			for (const input of [key(letter), key(russian), key(arrow), key(russian, { code: `Key${letter.toUpperCase()}` })]) {
				assert.deepEqual(motionForKey({ ...input, ctrlKey }), { x, y, zoom: 0 });
			}
		}
	}
	for (const ctrlKey of [false, true]) {
		for (const input of [key('+', { shiftKey: true }), key('='), key('=', { code: 'Equal' }), key('+', { code: 'Equal', shiftKey: true }), key('+', { code: 'NumpadAdd' })]) {
			assert.equal(motionForKey({ ...input, ctrlKey }).zoom, 1);
		}
		for (const input of [key('-'), key('-', { code: 'Minus' }), key('-', { code: 'NumpadSubtract' })]) {
			assert.equal(motionForKey({ ...input, ctrlKey }).zoom, -1);
		}
	}
});

test('physical navigation and zoom keys work independently of layout symbols', () => {
	for (const ctrlKey of [false, true]) {
		assert.deepEqual(motionForKey(key('unmapped', { code: 'KeyJ', ctrlKey })), { x: 0, y: 1, zoom: 0 });
		assert.equal(motionForKey(key('unmapped', { code: 'Equal', ctrlKey })).zoom, 1);
		assert.equal(motionForKey(key('unmapped', { code: 'Minus', ctrlKey })).zoom, -1);
	}
});

test('unrelated shortcuts and composition are left alone', () => {
	for (const event of [key('h', { altKey: true }), key('j', { metaKey: true }), key('k', { isComposing: true }), key('H', { code: 'KeyH', shiftKey: true }), key('ArrowDown', { ctrlKey: true, shiftKey: true }), key('x'), key('+', { ctrlKey: true, altKey: true })]) {
		assert.equal(motionForKey(event), null);
	}
});

function viewport() {
	let next = 1;
	const frames = new Map();
	const win = {
		requestAnimationFrame: callback => { const id = next++; frames.set(id, callback); return id; },
		cancelAnimationFrame: id => frames.delete(id),
	};
	const canvas = { wrapperEl: { ownerDocument: { defaultView: win }, isConnected: true }, tx: 0, ty: 0, zoom: 0, tZoom: 0, zoomCenter: null, markViewportChanged() {} };
	return { canvas, frames, step(time) {
		const pending = [...frames.values()]; frames.clear();
		for (const callback of pending) callback(time);
	} };
}

test('pan and zoom animate, repeated input accumulates, and settle exactly', () => {
	const animator = new ViewportAnimator();
	const mock = viewport();
	assert.equal(asViewport(mock.canvas), mock.canvas);
	animator.move(mock.canvas, 100, 50, 0.25);
	mock.step(16);
	assert.ok(mock.canvas.tx > 0 && mock.canvas.tx < 100);
	assert.ok(mock.canvas.tZoom > 0 && mock.canvas.tZoom < 0.25);
	animator.move(mock.canvas, 100, 0, 0.25);
	for (let time = 32; time < 2000; time += 16) mock.step(time);
	assert.equal(mock.canvas.tx, 200);
	assert.equal(mock.canvas.ty, 50);
	assert.equal(mock.canvas.tZoom, 0.5);
	assert.equal(mock.frames.size, 0);
});

test('animations stop on unload, dragging and detached views; incompatible APIs are ignored', () => {
	const animator = new ViewportAnimator();
	const mock = viewport();
	animator.move(mock.canvas, 100, 0, 0);
	animator.stopAll();
	assert.equal(mock.frames.size, 0);
	animator.move(mock.canvas, 100, 0, 0);
	mock.canvas.isDragging = true;
	mock.step(16);
	assert.equal(mock.frames.size, 0);
	assert.equal(mock.canvas.tx, 0);
	mock.canvas.isDragging = false;
	mock.canvas.wrapperEl.isConnected = false;
	animator.move(mock.canvas, 100, 0, 0);
	mock.step(32);
	assert.equal(mock.frames.size, 0);
	assert.equal(asViewport({ tx: 0 }), null);
});

test('Canvas keyboard handling respects editing, dialogs, panes and unload', () => {
	const mock = viewport();
	const win = mock.canvas.wrapperEl.ownerDocument.defaultView;
	const doc = mock.canvas.wrapperEl.ownerDocument;
	win.document = doc;
	doc.body = {};
	doc.activeElement = { closest: () => false };
	doc.querySelector = () => null;
	mock.canvas.wrapperEl.contains = target => target === doc.body;
	mock.canvas.wrapperEl.clientWidth = 1000;
	mock.canvas.wrapperEl.clientHeight = 800;
	const listeners = new Map();
	const cleanups = [];
	const view = { getViewType: () => 'canvas', canvas: mock.canvas };
	const workspace = {
		iterateAllLeaves() {}, on() { return {}; }, getActiveViewOfType: () => view,
	};
	const plugin = {
		app: { workspace }, addCommand() {}, registerEvent() {},
		register: callback => cleanups.push(callback),
		registerDomEvent: (_win, name, callback) => {
			listeners.set(name, callback);
			cleanups.push(() => listeners.delete(name));
		},
	};
	const previousWindow = globalThis.window;
	globalThis.window = win;
	try {
		new CanvasNavigation(plugin).register();
		let prevented = 0;
		const event = { ...key('h'), composedPath: () => [doc.body], preventDefault() { prevented++; }, stopImmediatePropagation() {} };
		listeners.get('keydown')(event);
		assert.equal(prevented, 1);
		assert.equal(mock.frames.size, 1);
		listeners.get('pointerdown')();
		assert.equal(mock.frames.size, 0);
		for (const block of [
			() => { doc.activeElement.closest = () => true; },
			() => { doc.activeElement.closest = () => false; doc.querySelector = () => ({}); },
			() => { doc.querySelector = () => null; mock.canvas.selection = new Set([{ isEditing: true }]); },
			() => { mock.canvas.selection.clear(); event.composedPath = () => [{}]; },
		]) {
			block();
			listeners.get('keydown')(event);
			assert.equal(prevented, 1);
			assert.equal(mock.frames.size, 0);
		}
		for (const cleanup of cleanups) cleanup();
		assert.equal(listeners.size, 0);
	} finally {
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
	}
});
