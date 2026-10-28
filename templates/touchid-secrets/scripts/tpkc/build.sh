#!/usr/bin/env bash
# Compile tpkc next to this script. Plain ad-hoc signing; no entitlements.
set -euo pipefail
cd "$(dirname "$0")"
swiftc -O tpkc.swift -o tpkc -framework Security -framework LocalAuthentication
out=$(./tpkc 2>&1 || true)
grep -q usage <<<"$out" && echo "built $(pwd)/tpkc"
