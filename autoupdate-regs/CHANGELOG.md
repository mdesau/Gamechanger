# Changelog - AutoUpdate Regs to Stats

All notable changes to the AutoUpdate Regs to Stats tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-01-23

### Added
- **Comprehensive sync accounting system**:
  - "Already Updated" category tracks players with Birth Date AND Draft already populated
  - "Updated" category tracks players newly populated (were missing data)
  - "NOT Updated" verification check identifies registered players not synced to Draft_Stats
  - Separate counts for draft-eligible vs excluded division players
- **Duplicate registration handling**:
  - Smart prioritization: when player has multiple registrations, chooses draft-eligible division over excluded divisions
  - Handles edge case where players registered for both Evaluation AND draft divisions (IMP/AMP/Majors/Minors)
- **Enhanced debug logging**:
  - `NAME_MATCHING` debug flag with character-code analysis
  - `DUPLICATE_REG` event logging shows division selection logic
  - `UPDATE_FLOW` logging with complete decision tracking
  - `ADD_FLOW` logging for new player additions

### Changed
- Improved UI alert messaging with detailed category breakdown
- Updated accounting formula: Draft-eligible = Already Updated + Updated + Added + NOT Updated
- Enhanced logging output in Automation Log sheet

### Fixed
- Players registered in multiple divisions (e.g., Evaluation + IMP) now correctly sync with draft-eligible division
- Prevented excluded divisions from overwriting draft-eligible registration data

## [2.0.0] - 2026-01-15

### Added
- AI-integrated features using Gemini 2.5 Flash
- Ask AI Scouting Assistant with open-ended prompt support
- Negative Coach Request Assistant with sentiment analysis
- Custom HTML dialogs for improved user experience
- Standardized AI activity logging

### Changed
- Major architectural improvements for AI integration
- Enhanced error handling for AI tools

## [1.0.0] - 2026-01-19

### Added
- Initial release: Registration to stats synchronization
- Core sync logic between Registrations and Draft_Stats sheets
- Challenge team assignment integration
- Automated data cleanup for unregistered players
- Custom "Gamechanger" menu with Update Draft Stats trigger
- Persistent Automation Log tracking
- Division abbreviation mapping (IMP, AMP, Majors, Minors)
- Excluded division handling (Tee Ball, Rookie, Evaluation, Junior)

---

**Git Tags**: Use `autoupdate-regs-v2.1`, `autoupdate-regs-v2.0`, `autoupdate-regs-v1.0` for version-specific references.
