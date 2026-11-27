#!/bin/bash
source "$(dirname "$0")/../_fixture/project.sh"
status_file "Key gates" "7 Operate and learn, Done" "1.1.0 (shipped 2026-11-14)"
# Close iteration 2 so the next request opens iteration 3.
sed -i.bak 's/| 2 | Feature | CR-1 | 2026-11-10 | | |/| 2 | Feature | CR-1 | 2026-11-10 | 2026-11-14 | Released as 1.1.0 |/' docs/project-status.md && rm docs/project-status.md.bak
base_project
