# AutoUpdate Regs to Stats

**Version 2.3** | AI-Powered Registration Synchronization for Youth Baseball Drafts

Automated synchronization of registration data to draft board statistics, with intelligent handling of duplicate registrations and comprehensive tracking.

## Overview

This tool automatically syncs player registration information from your league's registration system (e.g., SportsConnect) to your Draft_Stats board in Google Sheets. It handles complex scenarios like players registered in multiple divisions, tracks sync results with detailed accounting, and provides AI-powered scouting assistance.

## Key Features

### Core Sync
- ✅ **Automated data synchronization** from Registrations → Draft_Stats
- ✅ **Smart duplicate handling** - prioritizes draft-eligible divisions over excluded divisions
- ✅ **Challenge team integration** - syncs team assignments automatically
- ✅ **Automatic cleanup** - clears data for unregistered players
- ✅ **Sanity Checker (v2.2)** - Bi-directional validation finding ghosts and missing players

### Sync Accounting (v2.1)
- 📊 **Already Updated** - Players with complete Birth Date + Draft data
- 📊 **Updated** - Players newly populated (were missing data)
- 📊 **Added** - Brand new players appended to Draft_Stats
- 📊 **Cleared** - Players removed from registrations
- 📊 **NOT Updated** - Verification check for sync failures

### AI Tools (v2.0+)
- 🤖 **AI Scouting Assistant** - Ask open-ended questions about your draft board
- 🤖 **Negative Coach Request Scanner** - Detects parent requests to avoid specific coaches
- 🤖 **Draft Insights** - Executive summaries of talent trends
- 🏗️ **GeminiClient Infrastructure (v2.3)** - Robust, unified API handling with retry logic

### Debug & Logging
- 🐛 **NAME_MATCHING debug mode** - Character-code analysis for troubleshooting name match failures
- 🐛 **DUPLICATE_REG logging** - Shows which division was chosen for players with multiple registrations
- 📝 **Automation Log** - Persistent tracking of all sync runs with detailed metrics

## Installation

### Prerequisites
- Google Sheets with tabs: `Draft_Stats`, `Registrations`, `Challenge`
- For AI features: Free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Setup Steps

1. **Open your Google Sheet**
2. **Go to Extensions → Apps Script**
3. **Copy** the contents of [`AutoUpdate Regs to Stats.gs`](AutoUpdate%20Regs%20to%20Stats.gs)
4. **Paste** into Apps Script editor
5. **Save** the project (Ctrl/Cmd + S)

6. **Set up Gemini API key** (for AI features):
   - In Apps Script, go to **Project Settings** (⚙️ icon)
   - Scroll to **Script Properties**
   - Click **Add script property**
   - Property name: `GEMINI_API_KEY`
   - Value: Your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

7. **Refresh your Google Sheet** - A new "Gamechanger" menu should appear

## Usage

### Running the Sync

1. Click **Gamechanger** menu → **Update Draft Stats**
2. Review the popup showing:
   - Total registered players (draft-eligible)
   - Already Updated / Updated / Added / Cleared / NOT Updated counts
   - Players in excluded divisions (Tee Ball, Rookie, Evaluation, Junior)
3. Check **Automation Log** sheet for detailed execution history

### Running the Sanity Checker (v2.2)

1. Click **Gamechanger** menu → **Run Sanity Checker**
2. The tool performs a bidirectional check:
   - **Forward**: Registry -> Draft_Stats
   - **Reverse**: Draft_Stats -> Registry
3. A report sheet `Sanity_Check_Results` is generated with color-coded actions (Missing players/Orphaned records).

### Troubleshooting Name Matches

If players show up as "NOT Updated":

1. Open the script editor (Extensions → Apps Script)
2. Change `NAME_MATCHING: false` to `NAME_MATCHING: true` (line ~140)
3. Run **Update Draft Stats** again
4. Check **Debug_Log** sheet for:
   - `DUPLICATE_REG` - Shows which division was chosen for duplicate registrations
   - `UPDATE_FLOW` - Shows why a player wasn't updated (excluded division, match failure, etc.)
   - Character code analysis to detect hidden whitespace issues

### Using AI Scouting Assistant

1. Click **Gamechanger** → **AI Tools** → **Ask AI Scouting Assistant**
2. Enter your question (examples):
   - "Which players would make the best team captains?"
   - "Compare the top 5 pitchers and recommend draft order"
   - "If our league prioritizes strong bats who can pitch, give me a list of the top 10 probable picks"
3. Review AI analysis in the popup dialog

## How It Works

### Duplicate Registration Logic (v2.1 Fix)

When a player appears multiple times in Registrations:

1. **First occurrence** - Stored in lookup map
2. **Subsequent occurrences** - Compared with existing:
   - If **new = excluded** AND **existing = draft-eligible** → Keep existing (don't overwrite)
   - If **new = draft-eligible** → Overwrite (upgrade from excluded)
   - If **both excluded or both eligible** → Use most recent

**Example**: Lucas Thomas registered for both "Evaluation" (excluded) and "IMP Machine Pitch" (draft-eligible):
- ✅ Script chooses IMP, populates Birth Date and Draft
- ❌ Old behavior: Would choose Evaluation (last row), leave fields empty

### Excluded Divisions

Players in these divisions are **NOT** synced to Draft_Stats:
- Rookie (Coach Pitch)
- Tee Ball
- Evaluation
- Junior

## Sheet Structure

### Required Sheets

**Draft_Stats** (destination):
- Headers: `Player First Name`, `Player Last Name`, `Player Birth Date`, `Draft`, `Special Player Requests`, `Challenge`

**Registrations** (source):
- Headers start at **Row 6**
- Data starts at **Row 7**
- Columns: `Player First Name`, `Player Last Name`, `Player Birth Date`, `Division Name`, `Special Player Request`

**Challenge** (source):
- Headers: `Player First Name`, `Player Last Name`, `Team Name`

### Auto-Created Sheets

- **Automation Log** - Sync history with timestamps and metrics
- **Debug_Log** - Debug output when NAME_MATCHING flag is enabled

## Version History

- **v2.3** (2026-01-31) - AI Infrastructure Refactor (`GeminiClient`), code modernization
- **v2.2** (2026-01-23) - Sanity Checker (bi-directional validation)
- **v2.1** (2026-01-23) - Duplicate registration handling, enhanced accounting, debug logging
- **v2.0** (2026-01-15) - AI integration (Scouting Assistant, Negative Coach Scanner)
- **v1.0** (2026-01-19) - Core sync and logging baseline

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

## Troubleshooting

**Q: Players show "NOT Updated" but they're in Registrations**
- A: Enable `NAME_MATCHING: true` debug flag and check Debug_Log for match failures (spelling, spacing, special characters)

**Q: Player registered for IMP but shows empty Birth Date/Draft**
- A: Check if they also have an Evaluation registration. v2.1 should handle this automatically. Verify Debug_Log shows `DUPLICATE_REG` decision.

**Q: AI Scouting Assistant says "Scout unavailable"**
- A: Check that GEMINI_API_KEY is set in Script Properties and your API key is valid

## Support

For issues, feature requests, or questions:
- Check [CHANGELOG.md](CHANGELOG.md) for known issues
- Review Debug_Log sheet with NAME_MATCHING enabled
- Check Automation Log for error messages

## License

This tool is provided as-is for youth baseball league management.
