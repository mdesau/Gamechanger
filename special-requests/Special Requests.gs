/**
 * PROJECT OVERVIEW: Negative Coach Request Detection & Analysis
 * ==============================================================================
 * This script provides AI-powered sentiment analysis for parent special player
 * requests in youth baseball leagues. It identifies polite or explicit requests
 * to avoid specific coaches, teams, or families, helping league administrators
 * make informed draft decisions.
 *
 * CURRENT VERSION: 1.0
 * +---------------------------------------------------------------------------------------------------+
 * |                                      CHANGE LOG                                                   |
 * +---------+-------------+---------------------------------------------------------------------------+
 * | VERSION | DATE        | DESCRIPTION                                                               |
 * +---------+-------------+---------------------------------------------------------------------------+
 * | 1.0     | 2026-01-22  | Initial release: Focused negative coach request scanning tool.            |
 * +---------+-------------+---------------------------------------------------------------------------+
 *
 * +-------------------------------------------------------------------------------------------------+
 * |                                      FEATURES LIST                                              |
 * +-------------------------------------------------------------------------------------------------+
 * | [GenAI]  Negative Coach Flagging: AI detection of "Avoid Coach" requests (pink highlights).    |
 * | [GenAI]  Division Change Flagging: AI detection of division change requests (yellow).          |
 * | [Core]   Color Coding: Single-tier flagging for clear admin review.                            |
 * | [Core]   Batch Processing: Efficient AI analysis in batches of 40 requests.                    |
 * | [Core]   Keyword Detection: Pre-filters negative coach requests for cost efficiency.           |
 * | [Core]   Custom Menus: Integrated Google Sheets UI for manual scan triggers.                   |
 * | [Core]   Logging: Persistent 'Automation Log' tracking with Success/Failed status icons.       |
 * | [Core]   Debug Mode: Optional detailed logging to 'Debug Log' sheet for troubleshooting.       |
 * +-------------------------------------------------------------------------------------------------+
 *
 * +-------------------------------------------------------------------------------------------------+
 * |                                   SHEET STRUCTURE REFERENCE                                     |
 * +-----------------------+-----------------------+-----------------------------------------------+
 * | SHEET NAME            | PURPOSE               | COLUMNS                                       |
 * +-----------------------+-----------------------+-----------------------------------------------+
 * | Player Requests       | Main data sheet       | A: Player First Name                          |
 * |                       |                       | B: Player Last Name                           |
 * |                       |                       | C: Division Name                              |
 * |                       |                       | D: Special Player Request                     |
 * +-----------------------+-----------------------+-----------------------------------------------+
 * | Automation Log        | Activity tracking     | Timestamp, Source, Status, Comments           |
 * +-----------------------+-----------------------+-----------------------------------------------+
 * | Debug Log             | Debug output          | Timestamp, Feature, Event, Payload JSON       |
 * +-----------------------+-----------------------+-----------------------------------------------+
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * API key for Gemini. Stored in Script Properties for security.
 * To set: Extensions → Apps Script → Project Settings → Script Properties
 * Add property: GEMINI_API_KEY = your-api-key-here
 */
const API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "";

/** Name of the log sheet used for activity tracking. */
const LOG_SHEET_NAME = "Automation Log";

/** Name of the debug log sheet. */
const DEBUG_LOG_SHEET_NAME = "Debug Log";

/**
 * Cell background and font colors for flagging requests.
 */
const NEG_COACH_COLOR = "#f4c7c3"; // light pink background

const DIV_CHANGE_COLORS = {
  BACKGROUND: "#FFEB9C", // light yellow background
  FONT: "#9C6500", // dark yellow/orange font
};

/**
 * Local synonym/keyword bank for potentially negative or avoidant language.
 * We build small regexes per keyword at runtime (case-insensitive).
 */
const NEG_COACH_KEYWORDS = [
  "not",
  "avoid",
  "dont",
  "don't",
  "bad experience",
  "issue",
  "problem",
  "conflict",
  "concern",
  "bust",
];

/**
 * DEBUG CONFIGURATION
 * Enable/disable debug logging. All debug logs go to the "Debug Log" sheet.
 * Set to true to enable detailed logging for troubleshooting.
 */
const DEBUG_ENABLED = true;

/**
 * RATE LIMITING CONFIGURATION
 * Free Tier: 15 RPM (Requests Per Minute)
 * To stay under this limit with margin for error, we add delays between batches.
 * Recommended: 4-5 seconds between batches for free tier.
 */
const INTER_BATCH_DELAY_MS = 5000; // 5 seconds between batches (safe for 15 RPM)

// ============================================================================
// MENU ENTRY POINTS
// ============================================================================

/**
 * Adds a consolidated "Gamechanger" menu with AI Tools submenu.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  const aiToolsMenu = ui
    .createMenu("AI Tools")
    .addItem("Negative Coach Request Assistant", "runNegativeCoachAssistant")
    .addItem("Division Change Request Assistant", "runDivisionChangeAssistant");

  ui.createMenu("Gamechanger")
    .addSubMenu(aiToolsMenu)
    .addToUi();
}

// ============================================================================
// NEGATIVE COACH REQUEST SCANNER
// ============================================================================

/**
 * Scans the "Special Player Request" column for polite or explicit
 * requests to avoid specific coaches, teams, or families.
 *
 * Behavior:
 * - Uses a cautious league-admin persona.
 * - Errs on the side of caution: ambiguous notes are flagged for review.
 * - Colors the Special Player Request cells light pink (#f4c7c3).
 */
function runNegativeCoachAssistant() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Verify API key exists before processing
  if (!API_KEY || API_KEY.trim() === "") {
    const errorMsg = 
      "❌ GEMINI_API_KEY is missing!\n\n" +
      "Please add your API key:\n" +
      "1. Extensions → Apps Script\n" +
      "2. Project Settings (gear icon)\n" +
      "3. Script Properties → Add property\n" +
      "4. Name: GEMINI_API_KEY\n" +
      "5. Value: your-api-key-here";
    
    ui.alert("Configuration Error", errorMsg, ui.ButtonSet.OK);
    
    // Log the error
    let logSheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
      logSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
    }
    logSheet.appendRow([
      new Date(),
      "AI",
      "❌ Failed",
      "Agent: (Negative Coach Assistant) --- Error: GEMINI_API_KEY not configured in Script Properties"
    ]);
    
    return;
  }
  
  const sheet = ss.getSheetByName("Player Requests");

  if (!sheet) {
    ui.alert("Player Requests sheet is missing. Unable to scan requests.");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerMap = getMap(headers);
  const specialReqColIdx = headerMap["special player request"];

  if (specialReqColIdx === undefined) {
    ui.alert(
      'Column "Special Player Request" was not found in Player Requests sheet. ' +
        "Please confirm the header spelling."
    );
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert("No player rows found to scan.");
    return;
  }

  const numRows = lastRow - 1;
  const requestRange = sheet.getRange(2, specialReqColIdx + 1, numRows, 1);
  const requestValues = requestRange.getValues();

  // Read current backgrounds to preserve division change (yellow) highlights
  const currentBackgrounds = requestRange.getBackgrounds();
  const currentFontColors = requestRange.getFontColors();

  let flaggedCount = 0;

  // Build a background matrix starting with current backgrounds (to preserve yellow)
  // Clear only pink backgrounds (negative coach flags from previous runs)
  const bgMatrix = currentBackgrounds.map(row => {
    const color = row[0];
    // Preserve yellow (division change), clear pink (old negative coach flags)
    if (color === NEG_COACH_COLOR) {
      return [null];
    }
    return [color];
  });
  
  const fontMatrix = currentFontColors.map(row => {
    const color = row[0];
    // Clear font color for old pink flags, preserve division change font color
    if (currentBackgrounds[currentFontColors.indexOf(row)][0] === NEG_COACH_COLOR) {
      return [null];
    }
    return [color];
  });

  // Collect all non-empty requests with their row indices
  const items = [];
  let totalNotesScanned = 0;
  
  for (let i = 0; i < requestValues.length; i++) {
    const raw = requestValues[i][0];
    const text = (raw || "").toString().trim();
    if (!text) continue;
    totalNotesScanned++;

    const isPotential = NEG_COACH_KEYWORDS.some((kw) => {
      const base = kw.toLowerCase();
      // Handle simple plural "s" for certain terms in one pattern
      if (
        base === "issue" ||
        base === "problem" ||
        base === "conflict" ||
        base === "concern"
      ) {
        const re = new RegExp(`\\b${base}s?\\b`, "i");
        return re.test(text);
      }
      // Default: case-insensitive substring match via regex
      const re = new RegExp(base, "i");
      return re.test(text);
    });

    if (!isPotential) continue;

    items.push({ index: i, text });
  }
  
  if (totalNotesScanned === 0) {
    ui.alert("No Special Player Requests found to analyze.");
    return;
  }

  // Batch size for a single Gemini call
  const BATCH_SIZE = 40;
  let hadError = false;
  let errorMessage = "";
  let totalApiCalls = 0; // Track actual API calls made (including retries)
  let batchNumber = 0;

  if (items.length > 0) {
    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      batchNumber++;
      const batch = items.slice(start, start + BATCH_SIZE);

      let labels;
      let apiCallsThisBatch = 0;
      try {
        const result = callGeminiForRequestBatch(batch);
        labels = result.labels;
        apiCallsThisBatch = result.apiCallCount;
        totalApiCalls += apiCallsThisBatch;
      } catch (e) {
        // Extract API call count from error message if available
        const match = String(e).match(/after (\d+) API calls/);
        if (match) {
          apiCallsThisBatch = parseInt(match[1], 10);
          totalApiCalls += apiCallsThisBatch;
        }
        
        hadError = true;
        errorMessage = String(e);
        // On failure, err on the side of caution for this batch
        labels = {};
        batch.forEach((item) => {
          labels[item.index] = "FLAG";
        });
      }

      batch.forEach((item) => {
        const classification = (labels[item.index] || "SAFE")
          .toString()
          .trim()
          .toUpperCase();

        if (classification.startsWith("FLAG")) {
          bgMatrix[item.index][0] = NEG_COACH_COLOR;
          flaggedCount++;
        }
      });
      
      // Rate limiting: Wait between batches to stay under 15 RPM (free tier)
      // Skip delay after the last batch
      if (start + BATCH_SIZE < items.length) {
        Utilities.sleep(INTER_BATCH_DELAY_MS);
      }
    }
  }

  requestRange.setBackgrounds(bgMatrix);
  requestRange.setFontColors(fontMatrix);

  // Log to Automation Log
  let logSheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet
      .getRange(1, 1, 1, 4)
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
  }

  const notesScanned = totalNotesScanned;
  const sentToAi = items.length;
  const batchSize = BATCH_SIZE;
  const batchesPlanned = sentToAi > 0 ? Math.ceil(sentToAi / batchSize) : 0;
  const approxTokens =
    sentToAi > 0
      ? Math.round(items.reduce((sum, it) => sum + it.text.length, 0) / 4)
      : 0;

  const logMessage =
    `Agent: (Negative Coach Assistant) --- Model: (gemini-2.5-flash-lite) --- ` +
    `Flagged: (${flaggedCount}) --- ` +
    `Notes scanned: (${notesScanned}) --- ` +
    `Sent to AI: (${sentToAi}) --- ` +
    `Batches: (${batchesPlanned}) --- ` +
    `API Calls: (${totalApiCalls}) --- ` +
    `Approx tokens: (${approxTokens})` +
    (hadError ? ` --- ERROR: ${errorMessage}` : "");

  const status = hadError ? "❌ Failed" : "✅ Success";
  logSheet.appendRow([new Date(), "AI", status, logMessage]);

  if (hadError) {
    const is429Error = errorMessage.includes("HTTP 429");
    const errorTitle = is429Error ? "Rate Limit Exceeded" : "Scanner Error";
    const errorAdvice = is429Error
      ? `⚠️ You've hit the free tier rate limit (15 requests/minute).\n\n` +
        `Flagged: ${flaggedCount} (partial results from ${totalApiCalls} successful API calls)\n\n` +
        `SOLUTIONS:\n` +
        `• Wait 60+ seconds before running this scan again\n` +
        `• Enable billing to get 300 RPM (still mostly free)\n` +
        `• Check Debug Log to see exact API call count\n\n` +
        `Error: ${errorMessage.slice(0, 200)}`
      : `⚠️ Scan completed with errors.\n\n` +
        `Flagged: ${flaggedCount}\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Check Debug Log for details.`;
    
    ui.alert(errorTitle, errorAdvice, ui.ButtonSet.OK);
  } else {
    ui.alert(
      "Negative Coach Request Scanner",
      `Scan complete.\n\nPossible requests flagged for review: ${flaggedCount}\n\n` +
      `⏱️ TIP: Wait 60+ seconds before running another scan to avoid rate limit errors.`,
      ui.ButtonSet.OK
    );
  }
}

// ============================================================================
// DIVISION CHANGE REQUEST SCANNER
// ============================================================================

/**
 * Scans the "Special Player Request" column for requests to change
 * to a different division (either up or down).
 *
 * Behavior:
 * - Uses a cautious league-admin persona.
 * - Analyzes ALL requests (no keyword pre-filtering).
 * - Flags any mention of division change, skill level concerns, or readiness.
 * - Colors flagged cells: yellow background (#FFEB9C) with dark yellow font (#9C6500).
 */
function runDivisionChangeAssistant() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Verify API key exists before processing
  if (!API_KEY || API_KEY.trim() === "") {
    const errorMsg = 
      "❌ GEMINI_API_KEY is missing!\n\n" +
      "Please add your API key:\n" +
      "1. Extensions → Apps Script\n" +
      "2. Project Settings (gear icon)\n" +
      "3. Script Properties → Add property\n" +
      "4. Name: GEMINI_API_KEY\n" +
      "5. Value: your-api-key-here";
    
    ui.alert("Configuration Error", errorMsg, ui.ButtonSet.OK);
    
    // Log the error
    let logSheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
      logSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
    }
    logSheet.appendRow([
      new Date(),
      "AI",
      "❌ Failed",
      "Agent: (Division Change Assistant) --- Error: GEMINI_API_KEY not configured in Script Properties"
    ]);
    
    return;
  }
  
  const sheet = ss.getSheetByName("Player Requests");

  if (!sheet) {
    ui.alert("Player Requests sheet is missing. Unable to scan requests.");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerMap = getMap(headers);
  const specialReqColIdx = headerMap["special player request"];

  if (specialReqColIdx === undefined) {
    ui.alert(
      'Column "Special Player Request" was not found in Player Requests sheet. ' +
        "Please confirm the header spelling."
    );
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert("No player rows found to scan.");
    return;
  }

  const numRows = lastRow - 1;
  const requestRange = sheet.getRange(2, specialReqColIdx + 1, numRows, 1);
  const requestValues = requestRange.getValues();

  // Read current backgrounds to preserve negative coach (pink) highlights
  const currentBackgrounds = requestRange.getBackgrounds();
  const currentFontColors = requestRange.getFontColors();

  let flaggedCount = 0;

  // Build matrices starting with current colors
  // Clear only yellow (division change flags from previous runs)
  // Preserve pink (negative coach flags take precedence)
  const bgMatrix = currentBackgrounds.map(row => {
    const color = row[0];
    // Clear yellow (old division flags), preserve pink (negative coach takes precedence)
    if (color === DIV_CHANGE_COLORS.BACKGROUND) {
      return [null];
    }
    return [color];
  });
  
  const fontMatrix = currentFontColors.map((row, idx) => {
    const bgColor = currentBackgrounds[idx][0];
    // Clear font color for old yellow flags, preserve others
    if (bgColor === DIV_CHANGE_COLORS.BACKGROUND) {
      return [null];
    }
    return [row[0]];
  });

  // Collect all non-empty requests with their row indices (NO keyword filtering)
  const items = [];
  let totalNotesScanned = 0;
  
  for (let i = 0; i < requestValues.length; i++) {
    const raw = requestValues[i][0];
    const text = (raw || "").toString().trim();
    if (!text) continue;
    totalNotesScanned++;
    items.push({ index: i, text });
  }
  
  // Pre-scan diagnostic: Check today's total API usage
  const todayApiUsage = getTodayApiUsage();
  const dailyQuotaRemaining = 1000 - todayApiUsage;
  
  if (DEBUG_ENABLED) {
    logDebug("Division Change Scanner", "QUOTA_CHECK", {
      todayApiUsage,
      dailyQuotaLimit: 1000,
      dailyQuotaRemaining,
      quotaStatus: dailyQuotaRemaining > 100 ? "HEALTHY" : dailyQuotaRemaining > 0 ? "LOW" : "EXHAUSTED",
    });
    
    logDebug("Division Change Scanner", "SCAN_START", {
      totalNotesScanned,
      itemsToSendToAI: items.length,
      expectedBatches: Math.ceil(items.length / 40),
      expectedApiCalls: Math.ceil(items.length / 40),
      sampleRequests: items.slice(0, 3).map(it => it.text),
    });
  }
  
  // Warn if daily quota is nearly exhausted
  if (dailyQuotaRemaining < 50) {
    ui.alert(
      "⚠️ Daily Quota Warning",
      `You've used ${todayApiUsage} of 1000 daily API calls.\n\n` +
      `Only ${dailyQuotaRemaining} calls remaining today.\n\n` +
      `This scan needs ~${Math.ceil(items.length / 40)} calls.\n\n` +
      (dailyQuotaRemaining <= 0 
        ? "SOLUTION: Wait until tomorrow or upgrade to paid tier."
        : "Proceed with caution - you may hit the daily limit."),
      ui.ButtonSet.OK
    );
    if (dailyQuotaRemaining <= 0) return;
  }
  
  if (totalNotesScanned === 0) {
    ui.alert("No Special Player Requests found to analyze.");
    return;
  }

  // Batch size for a single Gemini call
  const BATCH_SIZE = 40;
  let hadError = false;
  let errorMessage = "";
  let totalApiCalls = 0; // Track actual API calls made (including retries)
  let batchNumber = 0;
  const scanStartTime = new Date();

  if (items.length > 0) {
    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      batchNumber++;
      const batchStartTime = new Date();
      const batch = items.slice(start, start + BATCH_SIZE);
      const timeElapsedSec = (batchStartTime - scanStartTime) / 1000;

      if (DEBUG_ENABLED) {
        const timeSinceLastBatch = batchNumber === 1 ? 0 : (batchStartTime - scanStartTime - (batchNumber - 1) * INTER_BATCH_DELAY_MS) / 1000;
        const currentRpm = batchNumber === 1 ? 0 : (totalApiCalls / (timeElapsedSec / 60)).toFixed(2);
        
        logDebug("Division Change Scanner", "BATCH_START", {
          batchNumber,
          batchSize: batch.length,
          totalBatches: Math.ceil(items.length / BATCH_SIZE),
          timestamp: batchStartTime.toISOString(),
          timeElapsedSec: timeElapsedSec.toFixed(2),
          timeSinceLastBatchSec: timeSinceLastBatch.toFixed(2),
          cumulativeApiCalls: totalApiCalls,
          currentRPM: currentRpm,
          rpmLimit: 15,
          rpmStatus: currentRpm > 15 ? "⚠️ OVER LIMIT" : "✅ Under limit",
        });
      }

      let labels;
      let apiCallsThisBatch = 0;
      try {
        const result = callGeminiForDivisionChangeBatch(batch);
        labels = result.labels;
        apiCallsThisBatch = result.apiCallCount;
        totalApiCalls += apiCallsThisBatch;
        
        if (DEBUG_ENABLED) {
          logDebug("Division Change Scanner", "BATCH_LABELS_RECEIVED", {
            batchNumber,
            batchSize: batch.length,
            apiCallsThisBatch,
            cumulativeApiCalls: totalApiCalls,
            labels: labels,
            sampleRequests: batch.slice(0, 3).map(it => ({ index: it.index, text: it.text })),
          });
        }
      } catch (e) {
        // Extract API call count from error message if available
        const match = String(e).match(/after (\d+) API calls/);
        if (match) {
          apiCallsThisBatch = parseInt(match[1], 10);
        } else {
          apiCallsThisBatch = 1;
        }
        totalApiCalls += apiCallsThisBatch;
        
        hadError = true;
        errorMessage = String(e);
        
        if (DEBUG_ENABLED) {
          const errorTime = new Date();
          const timeSinceScanStart = (errorTime - scanStartTime) / 1000;
          const currentRpm = totalApiCalls / (timeSinceScanStart / 60);
          const todayUsageNow = getTodayApiUsage() + totalApiCalls;
          
          // Diagnose which quota was hit
          let quotaType = "UNKNOWN";
          if (String(e).includes("429")) {
            if (todayUsageNow >= 1000) {
              quotaType = "DAILY_QUOTA (1000 RPD)";
            } else if (currentRpm > 15) {
              quotaType = "RATE_LIMIT (15 RPM rolling window)";
            } else {
              quotaType = "RATE_LIMIT (likely previous activity in 60s window)";
            }
          }
          
          logDebug("Division Change Scanner", "BATCH_ERROR", {
            batchNumber,
            error: String(e),
            apiCallsThisBatch,
            cumulativeApiCalls: totalApiCalls,
            timeSinceScanStartSec: timeSinceScanStart.toFixed(2),
            currentRPM: currentRpm.toFixed(2),
            todayTotalUsage: todayUsageNow,
            quotaType: quotaType,
            diagnosis: quotaType === "DAILY_QUOTA (1000 RPD)" 
              ? "Hit daily limit - wait until tomorrow or upgrade"
              : quotaType.includes("rolling window")
              ? "Previous API activity still in 60s window - wait 60+ seconds"
              : "Batches too close together - increase INTER_BATCH_DELAY_MS",
          });
        }
        
        // On failure, don't flag anything (safer for division changes)
        labels = {};
        batch.forEach((item) => {
          labels[item.index] = "SAFE";
        });
      }

      batch.forEach((item) => {
        const classification = (labels[item.index] || "SAFE")
          .toString()
          .trim()
          .toUpperCase();

        if (classification.startsWith("FLAG")) {
          // Only apply yellow if cell isn't already pink (negative coach takes precedence)
          if (bgMatrix[item.index][0] !== NEG_COACH_COLOR) {
            bgMatrix[item.index][0] = DIV_CHANGE_COLORS.BACKGROUND;
            fontMatrix[item.index][0] = DIV_CHANGE_COLORS.FONT;
            flaggedCount++;
          }
        }
      });
      
      // Rate limiting: Wait between batches to stay under 15 RPM (free tier)
      // Skip delay after the last batch
      if (start + BATCH_SIZE < items.length) {
        if (DEBUG_ENABLED) {
          logDebug("Division Change Scanner", "RATE_LIMIT_DELAY", {
            batchNumber,
            delayMs: INTER_BATCH_DELAY_MS,
            reason: "Staying under 15 RPM (free tier limit)",
          });
        }
        Utilities.sleep(INTER_BATCH_DELAY_MS);
      }
    }
  }

  requestRange.setBackgrounds(bgMatrix);
  requestRange.setFontColors(fontMatrix);

  // Log to Automation Log
  let logSheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet
      .getRange(1, 1, 1, 4)
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
  }

  const notesScanned = totalNotesScanned;
  const sentToAi = items.length;
  const batchSize = BATCH_SIZE;
  const batchesPlanned = sentToAi > 0 ? Math.ceil(sentToAi / batchSize) : 0;
  const approxTokens =
    sentToAi > 0
      ? Math.round(items.reduce((sum, it) => sum + it.text.length, 0) / 4)
      : 0;

  const logMessage =
    `Agent: (Division Change Assistant) --- Model: (gemini-2.5-flash-lite) --- ` +
    `Flagged: (${flaggedCount}) --- ` +
    `Notes scanned: (${notesScanned}) --- ` +
    `Sent to AI: (${sentToAi}) --- ` +
    `Batches: (${batchesPlanned}) --- ` +
    `API Calls: (${totalApiCalls}) --- ` +
    `Approx tokens: (${approxTokens})` +
    (hadError ? ` --- ERROR: ${errorMessage}` : "");

  const status = hadError ? "❌ Failed" : "✅ Success";
  logSheet.appendRow([new Date(), "AI", status, logMessage]);

  if (hadError) {
    const is429Error = errorMessage.includes("HTTP 429");
    const errorTitle = is429Error ? "Rate Limit Exceeded" : "Scanner Error";
    const errorAdvice = is429Error
      ? `⚠️ You've hit the free tier rate limit (15 requests/minute).\n\n` +
        `Flagged: ${flaggedCount} (partial results from ${totalApiCalls} successful API calls)\n\n` +
        `SOLUTIONS:\n` +
        `• Wait 60+ seconds before running this scan again\n` +
        `• Enable billing to get 300 RPM (still mostly free)\n` +
        `• Check Debug Log to see exact API call count\n\n` +
        `Error: ${errorMessage.slice(0, 200)}`
      : `⚠️ Scan completed with errors.\n\n` +
        `Flagged: ${flaggedCount}\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Check Debug Log for details.`;
    
    ui.alert(errorTitle, errorAdvice, ui.ButtonSet.OK);
  } else {
    ui.alert(
      "Division Change Request Scanner",
      `Scan complete.\n\nPossible requests flagged for review: ${flaggedCount}\n\n` +
      `⏱️ TIP: Wait 30 seconds before running another scan to avoid rate limit errors.`,
      ui.ButtonSet.OK
    );
  }
}

// ============================================================================
// GEMINI API INTEGRATION
// ============================================================================

/**
 * Gemini caller for batched negative coach request analysis.
 * Uses JSON mode to return a mapping of row index → label.
 *
 * @param {{index:number,text:string}[]} items - Array of requests with row indices.
 * @return {{labels: Object<number,string>, apiCallCount: number}} Map of index -> FLAG | SAFE, and count of API calls made.
 */
function callGeminiForRequestBatch(items) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;
  const list = items
    .map(
      (it) => `{ "index": ${it.index}, "request": ${JSON.stringify(it.text)} }`,
    )
    .join(",\n  ");
  
  let apiCallCount = 0; // Track actual API calls including retries

  const prompt =
    "ROLE & GOAL:\n" +
    'You are a cautious youth baseball league administrator reviewing parent "Special Player Request" notes.\n' +
    "Your ONLY task is to detect whether a parent is trying to keep their child off a specific coach's team or away from a particular family.\n" +
    "Err on the side of caution, especially for any polite or indirect wording.\n\n" +
    "INPUT:\n" +
    "You will receive a JSON array of objects: [{ index: number, request: string }].\n" +
    "Each 'request' is a single parent's note from the Special Player Request column.\n\n" +
    "LABELING RULES:\n" +
    "- FLAG = any request to AVOID a specific coach, team, or family (explicit or polite/indirect).\n" +
    "- SAFE = all other cases, including neutral or positive mentions of coaches, teams, or friends.\n" +
    "- DO NOT mark FLAG just because a coach name or the word 'coach' appears. There must be negative or avoidant language in the sentence (not, avoid, don't want, rather not, bad experience, conflict, issue, etc.).\n" +
    "- When truly uncertain, choose SAFE.\n" +
    '- Examples that are SAFE: "wants to play for Coach Smith again", "would love to be with Coach Jones", "hopes to be with friends on Coach Lee\'s team".\n' +
    "EXAMPLES (YOU MUST FOLLOW):\n" +
    '1) "Request to be with a seasoned coach who understands and will work towards player development - had a new coach last fall and it was a bit of a bust" => FLAG.\n' +
    '2) "He would prefer not to play for the Twins, he would not be a good fit with the coach." => FLAG.\n' +
    '3) "I kindly request that Owen not be placed on a team coached by Greg Nowick. Thank you!" => FLAG.\n' +
    '4) "Please, do not put on Stoffey teams. We have never requested anything but it was not a great experience." => FLAG.\n\n' +
    "OUTPUT FORMAT:\n" +
    "Return a JSON object mapping row index to label. Example:\n" +
    '{ "0": "FLAG", "5": "SAFE" }\n\n' +
    "REQUESTS:\n" +
    `[
  ${list}
]`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [
        {
          text: "You are a cautious youth baseball league administrator focused on player safety and family comfort.",
        },
      ],
    },
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 256,
      temperature: 0.0,
    },
  };

  let response;
  const MAX_RETRIES = 2; // Reduced from 5 to 2 (only for transient errors)
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    apiCallCount++; // Count every API call attempt
    
    try {
      response = UrlFetchApp.fetch(url, {
        method: "POST",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      
      const statusCode = response.getResponseCode();
      
      // Success - break immediately
      if (statusCode === 200) break;
      
      // Rate limit (429) - don't retry, it won't help
      if (statusCode === 429) break;
      
      // Only retry on transient errors (500, 503)
      if (statusCode >= 500 && statusCode < 600) {
        if (i < MAX_RETRIES - 1) {
          Utilities.sleep(Math.pow(2, i) * 1000); // Exponential backoff
        }
      } else {
        // Other errors (4xx) - don't retry
        break;
      }
    } catch (e) {
      // Network failure - retry with backoff
      if (i === MAX_RETRIES - 1) {
        throw new Error(`Network failure after ${apiCallCount} API calls: ${e.message}`);
      }
      Utilities.sleep(Math.pow(2, i) * 1000);
    }
  }
  
  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText();

  if (DEBUG_ENABLED) {
    logDebug("Negative Coach Scanner", "BATCH_RESPONSE", {
      statusCode,
      itemsCount: items.length,
      apiCallCount,
      bodySnippet: bodyText.slice(0, 500),
    });
  }

  // Check for HTTP errors after all retries
  if (statusCode !== 200) {
    throw new Error(`HTTP ${statusCode} after retries: ${bodyText.slice(0, 200)}`);
  }

  // Parse outer JSON response
  let outer;
  try {
    outer = JSON.parse(bodyText);
  } catch (e) {
    throw new Error(`Malformed API response (not valid JSON): ${e.message}`);
  }

  const rawText = outer.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    // Empty response - likely content filter or API error
    if (DEBUG_ENABLED) {
      logDebug("Negative Coach Scanner", "NO_RAWTEXT", {
        outerSnippet: JSON.stringify(outer).slice(0, 500),
      });
    }
    throw new Error(`Empty response from Gemini (no candidates/content). API response: ${JSON.stringify(outer).slice(0, 200)}`);
  }

  // Clean the response: sometimes Gemini adds garbage text after the JSON
  // Extract only the JSON object by finding the first { and last }
  let cleanedText = rawText.trim();
  const firstBrace = cleanedText.indexOf('{');
  const lastBrace = cleanedText.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleanedText);
    if (DEBUG_ENABLED) {
      logDebug("Negative Coach Scanner", "PARSED_LABELS", {
        labels: parsed,
        apiCallCount,
        sampleRequests: items.slice(0, 5),
      });
    }
    return {
      labels: parsed && typeof parsed === "object" ? parsed : {},
      apiCallCount
    };
  } catch (e) {
    if (DEBUG_ENABLED) {
      logDebug("Negative Coach Scanner", "PARSE_ERROR", {
        error: String(e),
        apiCallCount,
        rawTextSnippet: rawText.slice(0, 500),
      });
    }
    // Throw error instead of silent fallback - caller will handle
    throw new Error(`JSON parse failed after ${apiCallCount} API calls: ${e.message}`);
  }
}

/**
 * Gemini caller for batched division change request analysis.
 * Uses JSON mode to return a mapping of row index → label.
 *
 * @param {{index:number,text:string}[]} items - Array of requests with row indices.
 * @return {{labels: Object<number,string>, apiCallCount: number}} Map of index -> FLAG | SAFE, and count of API calls made.
 */
function callGeminiForDivisionChangeBatch(items) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;
  const list = items
    .map(
      (it) => `{ "index": ${it.index}, "request": ${JSON.stringify(it.text)} }`,
    )
    .join(",\n  ");
  
  let apiCallCount = 0; // Track actual API calls including retries

  const prompt =
    "ROLE & GOAL:\n" +
    'You are a HIGHLY CAUTIOUS youth baseball league administrator reviewing parent "Special Player Request" notes.\n' +
    "Your task is to detect ANY mention of division placement, player readiness, experience level, or ability concerns.\n" +
    "ERR HEAVILY ON THE SIDE OF CAUTION - when in doubt about division/experience/ability concerns, FLAG IT.\n\n" +
    "INPUT:\n" +
    "You will receive a JSON array of objects: [{ index: number, request: string }].\n" +
    "Each 'request' is a single parent's note from the Special Player Request column.\n\n" +
    "LABELING RULES - FLAG if ANY of these appear:\n" +
    "- EXPLICIT division requests (\"move to Majors\", \"stay in IMP\", \"another season of coach pitch\", \"move to coach pitch\")\n" +
    "- IMPLIED division concerns through experience mentions:\n" +
    '  * \"first time\", \"never played\", \"first sport\" = FLAG (implies entry level/lower division)\n' +
    '  * \"only played one season\", \"only one season\" = FLAG (implies need for same level)\n' +
    '  * \"entry level\", \"beginner\" = FLAG (implies division placement concern)\n' +
    "- Age/developmental readiness concerns:\n" +
    '  * \"too young\", \"developmentally younger\", \"not ready\" = FLAG\n' +
    '  * Any mention of special needs affecting placement = FLAG\n' +
    "- Ability/skill level concerns:\n" +
    '  * \"needs more time\", \"grow his understanding\", \"develop skills\" = FLAG\n' +
    "- Division uncertainty/flexibility:\n" +
    '  * \"willing to do [Division] if ready\", \"might play [Division]\", \"likely play [Division]\" = FLAG\n' +
    "- ANY mention of moving between divisions (up OR down) = FLAG\n\n" +
    "SAFE = ONLY these cases:\n" +
    "  * Pure coach preferences with ZERO division/experience/ability mention\n" +
    "  * Friend/sibling requests with ZERO division/experience/ability mention\n" +
    "  * Positive team/coach memories with ZERO division concern\n\n" +
    "CRITICAL: If you see words like 'first', 'never', 'only', 'entry', 'beginner', 'young', 'ready', 'willing', 'develop', 'grow' combined with baseball context, FLAG IT.\n\n" +
    "EXAMPLES (YOU MUST FOLLOW EXACTLY):\n" +
    '1) "Alder has only played one season. If possible, it would be best for him to get another season of IMP under his belt. Thank you!" => FLAG (explicit stay request).\n' +
    '2) "This will be Avish\'s first sport. At entry level." => FLAG (first time + entry level = division concern).\n' +
    '3) "Would like to move Ben up to the Majors division and play on the same team as Brian" => FLAG (explicit move up).\n' +
    '4) "Chandler is on the Autism Spectrum. He is 8 but in first grade and is developmentally around a 6 year old. He played coach pitch in the fall after having an IMP Eval. We would like him to stay Coach Pitch one more season to grow his fielding understanding." => FLAG (explicit stay request + developmental).\n' +
    '5) "Move to coach pitch with brother Finn Elliott and coach Rob Elliott" => FLAG (explicit move request).\n' +
    '6) "Will likely play IMP but willing to do AMP if it is felt he is ready following evaluations." => FLAG (division uncertainty).\n' +
    '7) "This is Grant\'s first time playing baseball. He played tee ball at age 4, and has played soccer since then. He does understand most baseball rules, though." => FLAG (first time = experience concern).\n' +
    '8) "Would like to play with his friend Tommy on Coach Smith\'s team" => SAFE (no division/experience/ability concern).\n\n' +
    "OUTPUT FORMAT:\n" +
    "Return a JSON object mapping row index to label. Example:\n" +
    '{ "0": "FLAG", "5": "SAFE" }\n\n' +
    "REQUESTS:\n" +
    `[
  ${list}
]`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [
        {
          text: "You are a cautious youth baseball league administrator focused on proper division placement and player development.",
        },
      ],
    },
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
      temperature: 0.0,
    },
  };

  let response;
  const MAX_RETRIES = 2; // Reduced from 5 to 2 (only for transient errors)
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    apiCallCount++; // Count every API call attempt
    
    if (DEBUG_ENABLED && i > 0) {
      logDebug("Division Change Scanner", "RETRY_ATTEMPT", {
        retryNumber: i,
        totalAttempts: apiCallCount,
        waitTimeSec: Math.pow(2, i - 1),
      });
    }
    
    try {
      response = UrlFetchApp.fetch(url, {
        method: "POST",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      
      const statusCode = response.getResponseCode();
      
      // Success - break immediately
      if (statusCode === 200) break;
      
      // Rate limit (429) - don't retry, it won't help
      // Quota is time-based and retrying just burns more quota
      if (statusCode === 429) {
        if (DEBUG_ENABLED) {
          logDebug("Division Change Scanner", "RATE_LIMIT_HIT", {
            statusCode,
            retryNumber: i,
            willRetry: false,
            advice: "Wait 60+ seconds before next scan or upgrade to paid tier",
          });
        }
        break; // Exit retry loop - don't waste attempts
      }
      
      // Only retry on transient errors (500, 503)
      if (statusCode >= 500 && statusCode < 600) {
        if (DEBUG_ENABLED) {
          logDebug("Division Change Scanner", "SERVER_ERROR", {
            statusCode,
            retryNumber: i,
            willRetry: i < MAX_RETRIES - 1,
          });
        }
        
        if (i < MAX_RETRIES - 1) {
          Utilities.sleep(Math.pow(2, i) * 1000); // Exponential backoff
        }
      } else {
        // Other errors (4xx) - don't retry
        if (DEBUG_ENABLED) {
          logDebug("Division Change Scanner", "NON_RETRYABLE_ERROR", {
            statusCode,
            retryNumber: i,
            willRetry: false,
          });
        }
        break;
      }
    } catch (e) {
      // Network failure - retry with backoff
      if (DEBUG_ENABLED) {
        logDebug("Division Change Scanner", "NETWORK_ERROR", {
          error: String(e),
          retryNumber: i,
          willRetry: i < MAX_RETRIES - 1,
        });
      }
      
      if (i === MAX_RETRIES - 1) {
        throw new Error(`Network failure after ${apiCallCount} API calls: ${e.message}`);
      }
      Utilities.sleep(Math.pow(2, i) * 1000);
    }
  }
  
  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText();

  if (DEBUG_ENABLED) {
    logDebug("Division Change Scanner", "BATCH_RESPONSE", {
      statusCode,
      itemsCount: items.length,
      apiCallCount,
      bodySnippet: bodyText.slice(0, 500),
    });
  }

  // Check for HTTP errors after all retries
  if (statusCode !== 200) {
    throw new Error(`HTTP ${statusCode} after retries: ${bodyText.slice(0, 200)}`);
  }

  // Parse outer JSON response
  let outer;
  try {
    outer = JSON.parse(bodyText);
  } catch (e) {
    throw new Error(`Malformed API response (not valid JSON): ${e.message}`);
  }

  const rawText = outer.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    // Empty response - likely content filter or API error
    if (DEBUG_ENABLED) {
      logDebug("Division Change Scanner", "NO_RAWTEXT", {
        outerSnippet: JSON.stringify(outer).slice(0, 500),
      });
    }
    throw new Error(`Empty response from Gemini (no candidates/content). API response: ${JSON.stringify(outer).slice(0, 200)}`);
  }

  // Clean the response: sometimes Gemini adds garbage text after the JSON
  // Extract only the JSON object by finding the first { and last }
  let cleanedText = rawText.trim();
  const firstBrace = cleanedText.indexOf('{');
  const lastBrace = cleanedText.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleanedText);
    if (DEBUG_ENABLED) {
      logDebug("Division Change Scanner", "PARSED_LABELS", {
        labels: parsed,
        apiCallCount,
        sampleRequests: items.slice(0, 5),
      });
    }
    return {
      labels: parsed && typeof parsed === "object" ? parsed : {},
      apiCallCount
    };
  } catch (e) {
    if (DEBUG_ENABLED) {
      logDebug("Division Change Scanner", "PARSE_ERROR", {
        error: String(e),
        apiCallCount,
        rawTextSnippet: rawText.slice(0, 500),
      });
    }
    // Throw error instead of silent fallback - caller will handle
    throw new Error(`JSON parse failed after ${apiCallCount} API calls: ${e.message}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Builds a case-insensitive header → column index map
 * from the first row of a sheet.
 *
 * @param {any[]} headers - Array of header cell values.
 * @return {Object<string, number>} Map of lowercase header text to index.
 */
function getMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    if (h) map[h.toString().toLowerCase().trim()] = i;
  });
  return map;
}

/**
 * Checks today's total API usage from Automation Log.
 * Returns total API calls made today (across all assistants).
 * 
 * @return {number} Total API calls made today
 */
function getTodayApiUsage() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    
    if (!logSheet || logSheet.getLastRow() < 2) return 0;
    
    const data = logSheet.getDataRange().getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalCalls = 0;
    
    for (let i = 1; i < data.length; i++) {
      const timestamp = new Date(data[i][0]);
      const comments = String(data[i][3] || "");
      
      // Check if this log entry is from today
      timestamp.setHours(0, 0, 0, 0);
      if (timestamp.getTime() === today.getTime()) {
        // Extract API Calls count from comments
        const match = comments.match(/API Calls: \((\d+)\)/);
        if (match) {
          totalCalls += parseInt(match[1], 10);
        }
      }
    }
    
    return totalCalls;
  } catch (e) {
    return 0;
  }
}

/**
 * Unified debug logging helper - logs debug info to the "Debug Log" sheet.
 * Only logs when DEBUG_ENABLED is true.
 * 
 * @param {string} feature - Feature name (e.g., "Negative Coach Scanner")
 * @param {string} event - Event description (e.g., "BATCH_RESPONSE", "API_CALL")
 * @param {Object} payload - Data to log (will be JSON stringified)
 */
function logDebug(feature, event, payload) {
  if (!DEBUG_ENABLED) return;
  
  try {
    // Also send to Apps Script log for quick console inspection
    try {
      Logger.log(
        "[%s] %s :: %s",
        feature,
        event,
        JSON.stringify(payload).slice(0, 1000)
      );
    } catch (logErr) {
      // Ignore logging errors
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(DEBUG_LOG_SHEET_NAME) || ss.insertSheet(DEBUG_LOG_SHEET_NAME);

    // Initialize headers if new sheet
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Feature", "Event", "Payload JSON"]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 180); // Timestamp
      sheet.setColumnWidth(2, 150); // Feature
      sheet.setColumnWidth(3, 150); // Event
      sheet.setColumnWidth(4, 600); // Payload
    }

    // Append debug entry
    sheet.appendRow([
      new Date(),
      feature,
      event,
      JSON.stringify(payload).slice(0, 50000),
    ]);
  } catch (e) {
    // Swallow errors; debug logging should never break the main script
  }
}
