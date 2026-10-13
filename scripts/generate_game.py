"""Generate an original trusted template; output path is operator-controlled."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from modax.forge import generate_game, validate_game

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("--title", default="MODAX Crystal Island")
parser.add_argument("--seed", type=int, default=42)
parser.add_argument("--godot", default="godot")
args = parser.parse_args()
if args.output.exists() and any(args.output.iterdir()):
    parser.error("Output must be empty; existing projects are never overwritten")
args.output.mkdir(parents=True, exist_ok=True)
files = generate_game(args.title, args.seed)
for item in files:
    (args.output / item["path"]).write_text(item["content"])
result = validate_game(files, args.godot)
print(json.dumps(result, indent=2))
sys.exit(0 if result["status"] == "passed" else 2)
