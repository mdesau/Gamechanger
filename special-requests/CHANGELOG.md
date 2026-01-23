# Changelog - Special Requests

All notable changes to the Special Requests AI Scanner will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-22

### Added
- Initial release: Focused negative coach request scanning tool
- AI-powered detection of "Avoid Coach" requests (pink highlights)
- AI-powered detection of division change requests (yellow highlights)
- Single-tier color coding for clear admin review
- Batch processing: Efficient AI analysis in batches of 40 requests
- Keyword detection: Pre-filters negative coach requests for cost efficiency
- Custom Google Sheets menu integration (Gamechanger → AI Tools)
- Persistent Automation Log tracking with Success/Failed status icons
- Debug mode: Optional detailed logging to Debug Log sheet for troubleshooting
- Rate limiting: 5-second delays between batches to stay under 15 RPM free tier limit
- Gemini API integration using gemini-2.5-flash-lite model
- JSON-mode API responses for reliable parsing
- Retry logic for transient API errors
- Daily quota tracking and warnings (1000 RPD limit)

### Technical Details
- Model: gemini-2.5-flash-lite
- Batch size: 40 requests per API call
- Rate limit compliance: 5000ms inter-batch delay
- Retry strategy: 2 attempts for 5xx errors, no retry for 429/4xx
- Debug logging: Structured JSON payloads in Debug Log sheet
