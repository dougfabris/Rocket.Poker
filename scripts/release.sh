#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check for dry-run flag (via argument or environment variable)
if [[ "$1" == "--dry-run" ]] || [[ "${DRY_RUN}" == "true" ]]; then
    DRY_RUN=true
    echo -e "${BLUE}🧪 DRY RUN MODE - No changes will be made${NC}"
else
    DRY_RUN=false
fi

echo -e "${GREEN}🚀 Rocket.Poker Release Script${NC}"
echo ""

# Helper function to execute or simulate commands
run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would execute: $@${NC}"
    else
        "$@"
    fi
}

# Check if we're in the right directory
if [ ! -f "app.json" ]; then
    echo -e "${RED}Error: app.json not found. Are you in the project root?${NC}"
    exit 1
fi

# Update all branches with remote
echo -e "${YELLOW}Fetching latest changes from origin...${NC}"
run_cmd git fetch origin

# Ensure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}Currently on branch: $CURRENT_BRANCH${NC}"
    if [ "$DRY_RUN" = false ]; then
        read -p "Switch to main branch? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            run_cmd git checkout main
        else
            echo -e "${RED}Aborted. Please switch to main branch first.${NC}"
            exit 1
        fi
    else
        echo -e "${BLUE}[DRY RUN] Would switch to main branch${NC}"
    fi
fi

# Update main branch
echo -e "${YELLOW}Updating main branch...${NC}"
run_cmd git pull origin main

# Update develop branch
echo -e "${YELLOW}Updating develop branch...${NC}"
run_cmd git fetch origin develop:develop

# Get current version
CURRENT_VERSION=$(node -p "require('./app.json').version")
echo -e "${GREEN}Current version: ${CURRENT_VERSION}${NC}"

# Show commits from develop that aren't in main
echo ""
echo -e "${YELLOW}Changes in develop since last release:${NC}"
git log main..develop --oneline --no-merges | head -20
echo ""

# Ask for version bump type
echo "What type of version bump?"
echo "  1) patch (0.0.x) - Bug fixes"
echo "  2) minor (0.x.0) - New features"
echo "  3) major (x.0.0) - Breaking changes"
echo "  4) custom - Enter specific version"
read -p "Select (1-4): " BUMP_TYPE

case $BUMP_TYPE in
    1)
        NEW_VERSION=$(node -p "const v=require('./app.json').version.split('.'); v[2]=parseInt(v[2])+1; v.join('.')")
        ;;
    2)
        NEW_VERSION=$(node -p "const v=require('./app.json').version.split('.'); v[1]=parseInt(v[1])+1; v[2]=0; v.join('.')")
        ;;
    3)
        NEW_VERSION=$(node -p "const v=require('./app.json').version.split('.'); v[0]=parseInt(v[0])+1; v[1]=0; v[2]=0; v.join('.')")
        ;;
    4)
        read -p "Enter new version (e.g., 1.2.3): " NEW_VERSION
        ;;
    *)
        echo -e "${RED}Invalid selection${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}New version will be: ${NEW_VERSION}${NC}"
if [ "$DRY_RUN" = false ]; then
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Aborted${NC}"
        exit 1
    fi
else
    echo -e "${BLUE}[DRY RUN] Proceeding with simulation...${NC}"
fi

# Merge develop into main
echo ""
echo -e "${YELLOW}Merging develop into main...${NC}"
run_cmd git merge develop --no-ff -m "chore: merge develop for release v${NEW_VERSION}"

# Update version in app.json
echo -e "${YELLOW}Updating app.json version...${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}[DRY RUN] Would update app.json version to ${NEW_VERSION}${NC}"
else
    node -e "const fs=require('fs'); const app=require('./app.json'); app.version='${NEW_VERSION}'; fs.writeFileSync('app.json', JSON.stringify(app, null, 4) + '\n');"
fi

# Commit version bump
run_cmd git add app.json
run_cmd git commit -m "chore: bump version to ${NEW_VERSION}"

# Create git tag
echo -e "${YELLOW}Creating tag v${NEW_VERSION}...${NC}"
run_cmd git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

# Push changes
echo ""
echo -e "${YELLOW}Pushing to origin...${NC}"
run_cmd git push origin main
run_cmd git push origin "v${NEW_VERSION}"

# Switch back to develop and merge main
echo ""
echo -e "${YELLOW}Updating develop branch...${NC}"
run_cmd git checkout develop
run_cmd git merge main --ff-only
run_cmd git push origin develop

echo ""
if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}✅ Dry run completed! No changes were made.${NC}"
    echo ""
    echo "To actually perform the release, run:"
    echo "  npm run release"
else
    echo -e "${GREEN}✅ Release v${NEW_VERSION} completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  - Create a GitHub release at: https://github.com/dougfabris/Rocket.Poker/releases/new?tag=v${NEW_VERSION}"
    echo "  - Deploy to Rocket.Chat marketplace if applicable"
fi
echo ""
