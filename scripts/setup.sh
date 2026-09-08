#!/usr/bin/env bash
# Create venv and install dependencies (Linux / macOS)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f ".venv/bin/python" ]]; then
  echo "Creating virtual environment in .venv ..."
  python3 -m venv .venv
fi

echo "Installing requirements ..."
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

echo ""
echo "Done. Activate with:"
echo "  source .venv/bin/activate"
echo "Then run:"
echo "  python app.py"
