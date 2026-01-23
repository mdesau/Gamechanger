# Stats Align Pipeline

AI-powered CSV stat file normalization for youth baseball league management with intelligent header mapping.

## Overview

This tool automates the import of coach and league CSV stat exports into a master Raw_Stats sheet with consistent column structure. Version 2.0 uses **Gemini 2.5 AI** to intelligently map varied stat naming conventions to standardized master columns, making it ideal for league-wide data with inconsistent formats.

## Features

- **AI-Powered Header Mapping**: Gemini 2.5 intelligently matches varied stat names to master columns
- **Context-Aware Detection**: AI understands Batting/Pitching/Fielding context for accurate mapping
- **JSON Mode API**: Structured AI responses ensure reliable, parseable mappings
- **2-Row Header Support**: Handles sectional headers (Batting/Pitching/Fielding) + stat names
- **Identity Detection**: AI-powered mapping of Jersey #, First Name, Last Name variations
- **Data Cleaning**: Automatically filters Totals, Team, and Glossary rows
- **Visual Audit Logs**: Two-row reconciliation showing exactly how source matched destination
- **Extra Stat Detection**: Identifies stats in CSV that don't have matching master columns
- **ScriptLock Protection**: Prevents concurrent runs on large imports

## Installation

1. Open your Google Sheet with a **Raw_Stats** sheet (2-row header structure)
2. Go to **Extensions → Apps Script**
3. Copy the entire contents of `StatsAlignPipeline.gs`
4. Paste into Apps Script editor (Code.gs)
5. Save the project (Ctrl+S or Cmd+S)
6. **Configure Gemini API Key**:
   - Get free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - In Apps Script: **Project Settings** (gear icon) → **Script Properties**
   - Add property: `GEMINI_API_KEY` = (your API key)

## Usage

### Sheet Structure Required

**Raw_Stats sheet** (master table):
- Row 1: Section labels (e.g., "Batting", "Pitching", "Fielding")
- Row 2: Stat names (e.g., "AVG", "HR", "IP", "ERA")

**Staging sheet**:
- Paste coach CSV exports here (with 2-row headers matching the same pattern)
- Row 1: Section labels
- Row 2: Stat names
- Row 3+: Player data

### Running the Import

1. Paste your coach's or league's CSV data into the **Staging** sheet
2. Go to **GC Automation → Align & Import Staging Data (AI)**
3. AI will analyze headers and map to master columns intelligently
4. Review the success dialog showing:
   - Number of players imported
   - Player range (first to last)
   - Stats aligned, missing, and extra
5. Check **Automation_Logs** sheet for detailed AI mapping reconciliation

### Understanding Logs

**Automation_Logs** shows two rows per import:
- **Row 1**: Master headers with success timestamp and player range
- **Row 2**: Shows which staging header filled each master column
  - Highlights extra stats that couldn't be mapped

### Reconciliation Metrics

- **Total Stats**: Processable columns in staging CSV
- **Aligned**: Successfully mapped to master columns
- **Missing**: Master columns not filled by staging data
- **Extra**: Staging columns with no matching master column

## AI Capabilities (v2.0)

**What the AI does:**
- Maps "Batting Average" → "Batting_AVG"
- Maps "#" or "Number" → "General_Number"
- Understands context: "AVG" in Batting section vs Pitching section
- Handles league-specific naming variations automatically
- Returns structured JSON for reliable parsing

**Limitations:**
- Requires Gemini API key (free tier available)
- AI mapping quality depends on header clarity
- Still requires 2-row sectional headers (no 1-row flat header support)
- May occasionally mismap ambiguous abbreviations

## API Usage

**Free Tier**: 15 requests/minute, 1000 requests/day
- Each import = 1 API call
- Sufficient for typical league workflows
- Enable billing for higher limits if needed

## Version

Current Version: **2.0** (2026-01-11)

See [CHANGELOG.md](CHANGELOG.md) for version history.
