#!/usr/bin/env python3
"""Run the installed report tools with the missing shared tooltip dependency."""

from pathlib import Path
import sys


SKILL_SCRIPTS = Path("/Users/shensanshi/.agents/skills/ai-job-analysis/scripts")
sys.path.insert(0, str(SKILL_SCRIPTS))

import build_report  # noqa: E402
import validate_report  # noqa: E402


build_report.TOOLTIP_STYLES_PATH = Path(__file__).with_name("tooltip.css")


if len(sys.argv) < 2 or sys.argv[1] not in {"build", "validate"}:
    raise SystemExit("usage: run_report_tool.py {build|validate} [arguments ...]")

mode = sys.argv.pop(1)
sys.argv[0] = "build_report.py" if mode == "build" else "validate_report.py"
raise SystemExit(build_report.main() if mode == "build" else validate_report.main())
