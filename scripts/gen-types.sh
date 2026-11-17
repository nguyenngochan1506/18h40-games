#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
cargo run --quiet --locked -p protocol --example gen_types
