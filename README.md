# Notion to Obsidian Migration (VaultMigrate)

> **⚠️ Work in Progress**  
> This plugin is currently in beta testing and has been tested with a limited set of databases. While functional, it needs more testing across different database structures and use cases. Your feedback and contributions would be greatly appreciated to make it more robust!

A plugin to migrate Notion databases to Obsidian.

## Features
- Import Notion databases with properties preserved in frontmatter 
- Support for all Notion property types (text, numbers, dates, relations, files)
- Dataview-compatible property formatting
- Configurable file organization and naming
- Progress tracking and error handling

## Setup
1. Create a Notion integration:
  - Go to [Notion Integrations](https://www.notion.so/my-integrations)
  - Create new integration
  - Copy the API key
2. Share your Notion database with the integration:
  - Open database in Notion
  - Click '...' → 'Add connections' → Select your integration

## Usage
1. Enter your Notion API key
2. Click "Search DBs" to list available databases
3. Select target database
4. Select which properties you want to import
5. Configure migration settings:
  - Migration path for notes
  - Migration path for subpages (pages linked inside other pages)
  - Attachment path for files
  - Content formatting options
6. Click "Start Migration"

## Settings
- **Create relations inside page**: Adds relation links in note content
- **Create Semantic Linking**: Enables Dataview-style linking
- **Squash Date Names**: Makes date fields Dataview-compatible
- **Attach page ID**: Prevents filename conflicts
- **Import subpages**: Includes linked pages
- **Import page content**: Includes Notion page content

## Known Issues
- If you use revision control with your obsidian vault, the name of your Notion pages might be too long
- Notion API rate limits may affect large database migrations
- Didn't test with very large files
- can't pause the import

## Support
Issues and feature requests: [GitHub Issues](https://github.com/alessandrobelli/notion-to-obsidian/issues)

## License
MIT License
