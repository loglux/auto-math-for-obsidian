# Shortcuts for the usual workflow (GNU make; on Windows: winget install ezwinports.make).
#   make check      lint + unit tests + build
#   make install    build and copy the plugin into the development vault (VAULT=...)
#   make qa         install, then run the automated part of QA-CHECKLIST.md in the running Obsidian
# The vault must be a test vault open in an Obsidian started with --remote-debugging-port=9339.
VAULT ?= A:/BlueProof-dev
PLUGIN_DIR = $(VAULT)/.obsidian/plugins/auto-math

.PHONY: help check install qa

help:
	@echo "make check | make install [VAULT=path] | make qa"

check:
	npm run check

install:
	npm run build
	mkdir -p "$(PLUGIN_DIR)"
	cp main.js manifest.json "$(PLUGIN_DIR)/"

qa: install
	node scripts/qa-desktop.mjs
