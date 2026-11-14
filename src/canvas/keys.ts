export type Motion = { x: number; y: number; zoom: number };

export function motionForKey(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'>): Motion | null {
	if (event.isComposing || event.altKey || event.metaKey) return null;
	// Physical key codes survive layout changes; aliases also support events without codes.
	const directions = new Map<string, [number, number]>([
		['KeyH', [-1, 0]], ['h', [-1, 0]], ['р', [-1, 0]], ['ArrowLeft', [-1, 0]],
		['KeyJ', [0, 1]], ['j', [0, 1]], ['о', [0, 1]], ['ArrowDown', [0, 1]],
		['KeyK', [0, -1]], ['k', [0, -1]], ['л', [0, -1]], ['ArrowUp', [0, -1]],
		['KeyL', [1, 0]], ['l', [1, 0]], ['д', [1, 0]], ['ArrowRight', [1, 0]],
	]);
	const direction = !event.shiftKey && (directions.get(event.code) ?? directions.get(event.key) ?? directions.get(event.key.toLowerCase()));
	if (direction) return { x: direction[0], y: direction[1], zoom: 0 };
	if (event.code === 'Equal' || event.code === 'NumpadAdd' || event.key === '+' || event.key === '=') return { x: 0, y: 0, zoom: 1 };
	if ((!event.shiftKey && event.code === 'Minus') || event.code === 'NumpadSubtract' || event.key === '-') return { x: 0, y: 0, zoom: -1 };
	return null;
}
