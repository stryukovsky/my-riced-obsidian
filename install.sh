#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
destination="$HOME/Work/my-vault/.obsidian/plugins/my-riced-obsidian"

if [ ! -f "$source_dir/main.js" ]; then
	printf '%s\n' 'main.js is missing. Run npm run build first.' >&2
	exit 1
fi

mkdir -p "$destination"
cp "$source_dir/manifest.json" "$source_dir/main.js" "$destination/"
if [ -f "$source_dir/styles.css" ]; then
	cp "$source_dir/styles.css" "$destination/"
fi
printf 'Installed plugin to %s\n' "$destination"
