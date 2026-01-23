# Changelog - Stats Align Pipeline

All notable changes to the Stats Align Pipeline will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
