#!/bin/zsh

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
export PYTHONPATH="$SCRIPT_DIR/.vendor${PYTHONPATH:+:$PYTHONPATH}"

if [ "$#" -eq 0 ]; then
  python3 "$SCRIPT_DIR/main.py" --test
else
  python3 "$SCRIPT_DIR/main.py" "$@"
fi
