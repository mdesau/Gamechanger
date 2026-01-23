# Stats Align Pipeline

Standardizes GameChanger CSV stat files into a consistent Raw_Stats table for youth baseball league management.

## Overview

This tool automates the import of coach-provided CSV stat exports into a master Raw_Stats sheet with consistent column structure. Version 1.0 uses direct string mapping for reliable processing of high-column count files (180+ columns) without AI dependencies.

## Features

- **Direct String Mapping**: Exact header matching without AI to prevent context-limit errors
- **2-Row Header Support**: Handles sectional headers (Batting/Pitching/Fielding) + stat names
- **Identity Detection**: Hard-coded logic for Jersey #, First Name, Last Name
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

1. Paste your coach's CSV data into the **Staging** sheet
2. Go to **GC Automation → Align & Import Staging Data**
3. Review the success dialog showing:
   - Number of players imported
   - Player range (first to last)
   - Stats aligned, missing, and extra
4. Check **Automation_Logs** sheet for detailed reconciliation

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

## Limitations (v1.0)

- Requires exact section/stat name matches (case-sensitive for stat names)
- No fuzzy matching or synonym support
- Works best with GameChanger exports using standard naming
- Cannot handle 1-row flat headers (requires sectional 2-row format)

## Version

Current Version: **1.0** (2026-01-11)

See [CHANGELOG.md](CHANGELOG.md) for version history.
