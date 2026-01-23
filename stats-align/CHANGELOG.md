# Changelog - Stats Align Pipeline

All notable changes to the Stats Align Pipeline will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-01-12

### Added
- **4-Tier Mapping Waterfall**: Exact → Synonym → Identity → Batch AI for maximum efficiency
- **Synonym Map**: 20+ built-in common stat name variations (e.g., "batting average" → Batting_AVG)
- **Dynamic Header Detection**: Auto-detects 1-row flat vs 2-row sectional header formats
- **AI Section Profiling**: For 1-row headers, AI categorizes columns into Batting/Pitching/Fielding
- **Batch Residual AI**: Single API call maps all unmapped stats with context windows
- **Context Windows**: Provides ±5 surrounding columns to AI for better accuracy
- **Visual AI Highlighting**: Blue background (#d9e9ff) marks AI-mapped columns in audit logs
- **Detailed Metrics**: Logs show source/aligned/missing/extra/AI mapping counts
- **Glossary Filtering**: Enhanced junk row detection now includes "glossary" keyword
- **Smart Identity Detection**: "first", "last", "#", "number", "jersey", "team" auto-recognized

### Changed
- **Menu Item**: Simplified to "Import & Align Staging Data" (no "AI" label needed)
- **Mapping Strategy**: Hybrid approach minimizes AI usage to ~5-15% of columns
- **Error Messages**: More descriptive failure logging for each tier
- **Version Display**: Shows tier breakdown in success dialog

### Technical Details
- Model: `gemini-2.5-flash-preview-09-2025` (unchanged)
- API Efficiency: Only residual stats sent to AI (typical: 0-3 unmapped stats per import)
- Tier 1-3: Deterministic, instant, free (85-95% of stats)
- Tier 4: AI-powered, 2-5 seconds, 1 API call (5-15% of stats)
- Synonym coverage: General (4), Batting (12), Pitching (6), Fielding (2)

### Performance Improvements
- **Cost Reduction**: Standard GameChanger CSVs often use 0 API calls
- **Speed**: 85-95% of stats mapped instantly without AI latency
- **Reliability**: Falls back gracefully through tiers for maximum success rate

## [2.0.0] - 2026-01-11

### Added
- **AI-Powered Header Mapping**: Gemini 2.5 Flash Preview integration for intelligent stat name matching
- **Context-Aware Section Detection**: AI understands Batting/Pitching/Fielding context for accurate mapping
- **JSON Mode API**: Structured AI responses using Gemini's JSON mode for reliable parsing
- **Varied Naming Convention Support**: Handles league-specific stat names (e.g., "Batting Average" → "Batting_AVG")
- **AI Identity Detection**: Intelligent mapping of "#", "Number", "First", "Last" variations
- **Single-Prompt Mapping**: Efficient AI call maps all headers in one request
- **Gemini API Configuration**: Script Properties support for GEMINI_API_KEY

### Changed
- **Menu Item**: Updated to "Align & Import Staging Data (AI)" to indicate AI processing
- **Version String**: Now includes AI designation in logs
- **Error Messages**: Enhanced to include AI-specific failures ("No player data aligned by AI")
- **Mapping Logic**: Replaced direct string matching with AI-powered contextual mapping

### Technical Details
- Model: `gemini-2.5-flash-preview-09-2025`
- API Mode: JSON-formatted responses
- Prompt Engineering: Single-prompt with master/incoming key lists and mapping rules
- Identity Rules: AI instructions for handling common identity column variations
- Context Rules: Section-aware mapping (e.g., "AVG" in Batting vs Pitching)

### Removed
- Direct string concatenation matching (replaced by AI)
- Hard-coded identity detection logic (now AI-powered)

## [1.0.0] - 2026-01-11

### Added
- Initial release: Direct string mapping pipeline for CSV stat imports
- 2-row header support (section + stat name structure)
- Direct header matching for Batting, Pitching, and Fielding sections
- Hard-coded identity detection (Jersey #, First Name, Last Name)
- Data cleaning filters (Totals, Team, Glossary rows)
- Visual audit logging with two-row reconciliation display
- Extra stat detection for unmapped source columns
- Missing stat reporting for unfilled master columns
- ScriptLock protection to prevent concurrent import runs
- Player range display (first player to last player imported)
- Yellow background highlighting for successfully imported rows in Raw_Stats
- Bottom border on audit log entries for visual separation

### Technical Details
- Processing: Direct string concatenation (Section_StatName matching)
- Identity columns: Exact match on "#", "number", "first", "last"
- Reconciliation: Full source vs master column accounting
- Import target: Raw_Stats sheet with 2-row header structure
- Staging source: Staging sheet with matching 2-row header format

### Limitations
- No AI or fuzzy matching (exact string match only)
- Requires 2-row sectional headers (no 1-row flat header support)
- Case-sensitive stat name matching
- No synonym support for alternate stat names
