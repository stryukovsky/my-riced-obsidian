export type Progress = Map<string, string>;

function validPath(path: unknown): path is string {
	return typeof path === 'string' && path.length > 0 &&
		!path.includes('\\') && !path.split('/').some(part => !part || part === '.' || part === '..');
}

export function parentPath(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash < 0 ? '/' : path.slice(0, slash);
}

export function parseProgress(text: string): Progress {
	const data: unknown = JSON.parse(text);
	if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 ||
		!('folders' in data) || !data.folders || typeof data.folders !== 'object' || Array.isArray(data.folders)) {
		throw new Error('Invalid progress file');
	}
	const entries = Object.entries(data.folders);
	for (const [folder, file] of entries) {
		if ((folder !== '/' && !validPath(folder)) || !validPath(file) || parentPath(file) !== folder) {
			throw new Error('Invalid progress entry');
		}
	}
	return new Map(entries as [string, string][]);
}

export function serializeProgress(progress: Progress): string {
	return JSON.stringify({ version: 1, folders: Object.fromEntries(progress) }, null, 2) + '\n';
}

export function renameProgress(progress: Progress, oldPath: string, newPath: string): void {
	const remap = (path: string): string => path === oldPath ? newPath :
		path.startsWith(oldPath + '/') ? newPath + path.slice(oldPath.length) : path;
	const entries = [...progress];
	progress.clear();
	for (const [folder, file] of entries) {
		const nextFolder = remap(folder);
		const nextFile = remap(file);
		// A file moved outside its tracked folder no longer represents progress there.
		if (parentPath(nextFile) === nextFolder) progress.set(nextFolder, nextFile);
		else progress.set(nextFolder, file);
	}
}
