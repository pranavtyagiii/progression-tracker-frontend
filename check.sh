#!/bin/bash
# Quick JSX/JS syntax check using esbuild (same parser Vite uses), without
# needing to resolve every import -- just validates syntax is well-formed.
cd /home/claude/frontend
npx esbuild "$1" --bundle --loader:.jsx=jsx --outfile=/tmp/_check_out.js \
  --external:react --external:react-dom --external:lucide-react --external:recharts --external:papaparse \
  --external:../shared --external:./shared --external:*.jsx --external:*.js 2>&1
