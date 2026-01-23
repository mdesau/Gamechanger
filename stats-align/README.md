# Stats Align Pipeline

Hybrid intelligence CSV normalization with 4-tier mapping: exact matching, synonym detection, identity recognition, and AI-powered residual mapping.

## Overview

Version 3.0 combines the best of both worlds: **fast, reliable direct matching** for standard formats with **intelligent AI backup** for edge cases. The pipeline automatically detects header structure (1-row vs 2-row) and applies a 4-tier waterfall approach to maximize accuracy while minimizing AI usage and cost.

## Key Features

### Intelligent Mapping Pipeline
- **Tier 1 - Exact Match**: Direct Section_StatName matching (fastest, most reliable)
- **Tier 2 - Synonym Map**: 20+ built-in common variations ("batting average" → Batting_AVG)
- **Tier 3 - Identity Detection**: Smart recognition of First/Last/Number columns
- **Tier 4 - Batch AI Residuals**: Gemini 2.5 handles only the unmapped stats in one call

### Dynamic Header Detection
- **Auto-detects format**: 1-row flat headers vs 2-row sectional headers
- **AI section profiling**: For 1-row headers, AI categorizes Batting/Pitching/Fielding
- **Context windows**: Provides surrounding columns to AI for better accuracy

### Audit & Debugging
- **Visual reconciliation**: AI-mapped columns highlighted in blue (#d9e9ff)
- **Detailed metrics**: Source stats, aligned, missing, extra, and AI mapping counts
- **Yellow highlighting**: Successfully imported rows in Raw_Stats (#fff2cc)
- **ScriptLock protection**: Prevents concurrent imports

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

1. Paste coach or league CSV data into the **Staging** sheet
2. Go to **GC Automation → Import & Align Staging Data**
3. Pipeline automatically:
   - Detects header format (1-row or 2-row)
   - Applies 4-tier mapping waterfall
   - Only uses AI for unmapped stats (cost-efficient)
4. Review success dialog showing detailed metrics
5. Check **Automation_Logs** for visual reconciliation (AI mappings highlighted in blue)

## 4-Tier Mapping Explained

### Tier 1: Exact Match
Staging key exactly matches master key.
- Example: `Batting_AVG` (staging) → `Batting_AVG` (master)
- **Speed**: Instant | **Reliability**: 100% | **Cost**: Free

### Tier 2: Synonym Match
Common stat name variations built into code.
- Example: `"batting average"` → `Batting_AVG`
- Handles 20+ variations: "games played", "plate appearances", "runs batted in", etc.
- **Speed**: Instant | **Reliability**: 100% | **Cost**: Free

### Tier 3: Identity Match
Smart Efficiency (v3.0)

**Why this hybrid approach?**
- **Cost-effective**: Most stats mapped via free tiers (Exact/Synonym/Identity)
- **Fast**: Only AI residuals add latency (typically 5-15% of columns)
- **Reliable**: Deterministic matching for standard stats, AI for edge cases
- **Auditable**: Blue highlights show exactly which stats needed AI

**Typical import breakdown:**
- 85% Exact + Synonym matches (instant, free)
- 10% Identity matches (instant, free)  
- 5% AI residual mappings (2-3 seconds, 1 API call)

**API Usage:**
- Free tier: 15 requests/minute, 1000/day
- Each import = 1 API call (only if residuals exist)
- Standard GameChanger exports often use 0 API calls!

## Limitations

- Requires 2-row sectional headers OR 1-row flat headers (no 3+ row headers)
- AI mapping quality depends on stat name clarity and context
- Rank columns automatically excluded from mapping
- Requires GEMINI_API_KEY for Tier 4 mapping (free tier available)

## Version

Current Version: **3.0** (2026-01-12

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
