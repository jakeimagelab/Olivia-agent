#!/bin/bash
set -euo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
reader_source="$script_dir/../../scripts/olivia-hermes-quote-reader.py"
hermes_dir="$HOME/.hermes/hermes-agent"
reader_dir="$HOME/.local/share/olivia/hermes-quote-reader"
label="com.olivia.hermes-quote-reader"
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"

mkdir -p "$reader_dir" "$(dirname -- "$plist")"
"$hermes_dir/venv/bin/python" - "$hermes_dir" "$reader_dir" "$reader_source" "$label" "$plist" <<'PY'
import plistlib
import sys
from pathlib import Path

hermes, directory, source, label, plist = sys.argv[1:]
reader = Path(directory) / Path(source).name
script = Path(source).read_bytes()
compile(script, str(reader), "exec")
config = {
    "Label": label,
    "ProgramArguments": [f"{hermes}/venv/bin/python", str(reader)],
    "WorkingDirectory": hermes,
    "EnvironmentVariables": {"PYTHONPATH": hermes},
    "RunAtLoad": True,
    "KeepAlive": True,
    "StandardOutPath": f"{directory}/stdout.log",
    "StandardErrorPath": f"{directory}/stderr.log",
}
for path, data in ((reader, script), (Path(plist), plistlib.dumps(config))):
    pending = path.with_suffix(".new")
    pending.write_bytes(data)
    pending.replace(path)
PY

if launchctl print "$domain/$label" >/dev/null 2>&1; then
  launchctl kickstart -k "$domain/$label"
else
  launchctl bootstrap "$domain" "$plist"
fi
