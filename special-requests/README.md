# Special Requests - AI Request Scanner

AI-powered sentiment analysis for parent special player requests in youth baseball leagues.

## Overview

This tool identifies polite or explicit requests to avoid specific coaches, teams, or families, helping league administrators make informed draft decisions.

## Features

- **Negative Coach Flagging**: AI detection of "Avoid Coach" requests (pink highlights)
- **Division Change Flagging**: AI detection of division change requests (yellow highlights)
- **Batch Processing**: Efficient AI analysis in batches of 40 requests
- **Smart Filtering**: Keyword pre-filtering for cost efficiency
- **Rate Limiting**: Built-in delays to stay within free tier limits (15 RPM)
- **Debug Logging**: Optional detailed logging to Debug Log sheet

## Installation

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Delete any existing code in `Code.gs`
4. Copy the entire contents of `Special Requests.gs` and paste it into `Code.gs`
5. Save the project (Ctrl+S or Cmd+S)
6. Configure your API key (see below)

### API Key Setup

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. In Apps Script, go to **Project Settings** (gear icon)
3. Scroll to **Script Properties**
4. Click **Add script property**
   - Property: `GEMINI_API_KEY`
   - Value: (paste your API key)
5. Click **Save**

## Usage

### Running the Scanners

1. In your Google Sheet, go to **Gamechanger → AI Tools**
2. Choose your scanner:
   - **Negative Coach Request Assistant**: Flags requests to avoid specific coaches/teams
   - **Division Change Request Assistant**: Flags requests for division changes

### Sheet Structure Required

Your sheet must have a tab named **Player Requests** with these columns:
- Column A: Player First Name
- Column B: Player Last Name
- Column C: Division Name
- Column D: Special Player Request

### Understanding the Results

**Pink Background (#f4c7c3)**: Negative coach request detected
- Parent wants to avoid a specific coach, team, or family
- Review these requests carefully for placement decisions

**Yellow Background (#FFEB9C) with dark yellow text**: Division change request detected
- Parent wants to move up/down divisions or mentions readiness concerns
- Review for proper division placement

### Rate Limits

**Free Tier**: 15 requests per minute (RPM), 1000 requests per day (RPD)

The tool automatically:
- Adds 5-second delays between batches
- Tracks daily API usage in Automation Log
- Warns you if approaching quota limits

**Tip**: Wait 60+ seconds between scans to avoid rate limit errors.

## Logs

### Automation Log
Tracks all scan activity with timestamps, status, and metrics:
- Agent used (Negative Coach vs Division Change)
- AI model (gemini-2.5-flash-lite)
- Items flagged, scanned, and sent to AI
- API calls made and approximate tokens used

### Debug Log
When `DEBUG_ENABLED = true`, captures detailed execution data:
- API responses and parsing steps
- Rate limiting diagnostics
- Error details for troubleshooting

## Version

Current Version: **1.0** (2026-01-22)

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Support

For issues or questions, check the Debug Log sheet for detailed error information.
