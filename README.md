# Gamechanger Stats Automation for Youth Baseball Drafts - Youth Baseball League Management Tools

A collection of Google Apps Script tools for automating youth baseball league administration tasks such as building draft stats for coaches, and identifying special player requests during registration.
Our league specifically uses Gamechanger for scoring (stats) and SportsConnect for registration. 

## 📁 Repository Structure

This is a **monorepo** containing multiple independent tools, each with its own versioning:

```
Gamechanger/
├── README.md                    # This file - project overview
├── special-requests/            # AI request analysis tool
│   ├── Special Requests.gs
│   ├── README.md
│   └── CHANGELOG.md
├── autoupdate-regs/             # Registration sync tool
│   ├── AutoUpdate Regs to Stats.gs
│   ├── README.md
│   └── CHANGELOG.md
└── stats-align/                 # Statistics pipeline tool
    ├── StatsAlignPipeline.gs
    ├── README.md
    └── CHANGELOG.md
```

## 🛠️ Tools Overview

| Tool | Latest Version | Description | AI-Powered |
|------|----------------|-------------|------------|
| [**Special Requests**](special-requests/) | v1.0 | AI sentiment analysis for parent requests - detects negative coach mentions and division change requests | ✅ Yes (Gemini) |
| [**AutoUpdate Regs**](autoupdate-regs/) | v2.2 | Automated registration-to-stats data synchronization with duplicate handling and sanity checking |  ✅ Yes (Gemini) |
| [**Stats Align Pipeline**](stats-align/) | TBD | Player statistics processing and alignment | ✅ Yes (Gemini) |

## 🚀 Quick Start

Each tool is self-contained with its own installation instructions but all contribute to various phases of aggregating coaches stats, building draft stats sheets for coaches, and identifying special player requests. 
Click the tool name above or navigate to the respective folder to get started.

### Prerequisites
- Google Sheets account
- Access to Google Apps Script (Extensions → Apps Script)
- For AI tools: Free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Installation Pattern
1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Copy the tool's `.gs` file contents
4. Paste into Apps Script editor
5. Follow tool-specific setup instructions in its README

## 📖 Tool Details

### Special Requests (AI Scanner)
**Purpose**: Analyze parent special player requests to identify:
- Requests to avoid specific coaches/teams (flagged pink)
- Division change requests (flagged yellow)

**Key Features**:
- AI-powered sentiment analysis using Gemini 2.5 Flash Lite
- Batch processing (40 requests per API call)
- Smart keyword filtering for cost efficiency
- Rate limiting for free tier (15 RPM, 1000 RPD)
- Debug logging for troubleshooting

**Best For**: League administrators processing draft requests who need to quickly identify placement concerns.

[→ Full Documentation](special-requests/README.md)

### AutoUpdate Regs to Stats
**Purpose**: Automatically sync registration data to player statistics tracking.

**Key Features**:
- Automated data pipeline
- Registration-to-stats synchronization
- Error handling and logging

**Best For**: Leagues using GC Stats and updating player information for registered players. 

[→ Full Documentation](autoupdate-regs/README.md)

### Stats Align Pipeline
**Purpose**: Process and validate player performance statistics.

**Key Features**:
- Statistics data processing
- Player performance tracking
- Data alignment and validation

**Best For**: League statisticians managing player performance data.

[→ Full Documentation](stats-align/README.md)

## 🏷️ Versioning Strategy

Each tool uses **independent semantic versioning** with Git tags:

- `special-requests-v1.0` - Special Requests v1.0
- `autoupdate-regs-v1.0` - AutoUpdate Regs v1.0
- `autoupdate-regs-v2.0` - AutoUpdate Regs v2.0
- `autoupdate-regs-v2.1` - AutoUpdate Regs v2.1
- `autoupdate-regs-v2.2` - AutoUpdate Regs v2.2

This allows you to:
- Track each tool's version history independently
- Roll back individual tools without affecting others
- Release updates to one tool without versioning others

## 🔄 Git Workflow

### Cloning the Repository
```bash
git clone <repository-url>
cd Gamechanger
```

### Working with Specific Tools
```bash
# Navigate to a tool's directory
cd special-requests/

# View tool-specific history
git log --follow -- .

# View all tags for this tool
git tag -l "special-requests-*"
```

### Checking Out Specific Versions
```bash
# Check out a specific tool version
git checkout special-requests-v1.0

# Return to latest
git checkout main
```

## 📝 Contributing

When making changes to a tool:

1. Work in the tool's subdirectory
2. Update the tool's CHANGELOG.md
3. Commit with descriptive messages referencing the tool name
4. Tag releases with the tool-specific naming convention

### Commit Message Format
```
<tool-name>: <type>: <description>

Examples:
special-requests: feat: Add batch size configuration option
autoupdate-regs: fix: Handle missing registration data
stats-align: docs: Update installation instructions
```

### Tagging Releases
```bash
# Tag a new version
git tag -a special-requests-v1.1 -m "Special Requests v1.1: Add retry logic"

# Push tags to remote
git push origin special-requests-v1.1
```

## 🤝 Support

For tool-specific issues:
1. Check the tool's README.md for troubleshooting
2. Review the tool's CHANGELOG.md for known issues
3. For AI tools: Check Debug Log sheet in your Google Sheet

## 📄 License

Individual tools may have their own licensing. Check each tool's directory for details.

---

**Repository**: Gamechanger Youth Baseball League Management Tools  
**Structure**: Monorepo with independent tool versioning  
**Last Updated**: January 22, 2026
