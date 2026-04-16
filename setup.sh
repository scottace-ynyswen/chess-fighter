#!/bin/bash
# Chess Fighter — One-time Setup Script
# Run with: bash setup.sh

set -e

echo ""
echo "♟  CHESS FIGHTER — SETUP"
echo "════════════════════════════"

# Install nvm (Node Version Manager) if not present
if [ ! -d "$HOME/.nvm" ]; then
  echo "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js LTS if not present
if ! command -v node &>/dev/null; then
  echo "Installing Node.js LTS..."
  nvm install --lts
  nvm use --lts
fi

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

# Install project dependencies
echo ""
echo "Installing dependencies..."
cd "$(dirname "$0")"
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Start the server with:"
echo "  npm start"
echo ""
echo "Then open: http://localhost:3001"
echo ""
