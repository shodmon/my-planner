#!/bin/bash
cd "$(dirname "$0")"
npm install && npm run dist
echo "Done. Open the dist folder and open the .dmg"
read -p "Press Enter to close"
