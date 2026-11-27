#!/bin/bash
source "$(dirname "$0")/../_fixture/project.sh"
status_file "Key gates" "6b Deploy, waiting for approval to deploy 1.1.0 to staging" "1.1.0 (awaiting staging deploy)"
base_project
