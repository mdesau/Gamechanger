/**
 * PROJECT OVERVIEW: Stats Alignment Pipeline (Staging → Raw_Stats)
 * @OnlyCurrentDoc
 * ==============================================================================
 * Hybrid intelligence CSV normalization pipeline combining direct matching,
 * synonym mapping, and AI-powered residual mapping for maximum reliability
 * and flexibility across diverse data sources.
 *
 * CURRENT VERSION: 3.0
 * +-----------------------------------------------------------------------------+
 * |                            CHANGE LOG                                       |
 * +---------+-------------+-------------------------------------------------------+
 * | VERSION | DATE        | DESCRIPTION                                           |
 * +---------+-------------+-------------------------------------------------------+
 * | 3.0     | 2026-01-12  | Hybrid 4-tier mapping with batch AI residuals         |
 * | 2.0     | 2026-01-11  | AI mapping for league stats with varied naming       |
 * | 1.0     | 2026-01-11  | Initial release: Direct mapping pipeline (no AI)      |
 * +---------+-------------+-------------------------------------------------------+
 *
 * +-----------------------------------------------------------------------------+
 * |                            FEATURES                                         |
 * +-----------------------------------------------------------------------------+
 * | [Core]   Dynamic Header Detection: Auto-detects 1-row vs 2-row formats     |
 * | [Core]   4-Tier Mapping: Exact → Synonym → Identity → Batch AI             |
 * | [Core]   Synonym Map: 20+ common stat name variations built-in             |
 * | [Core]   Identity Detection: Smart First/Last/Number recognition           |
 * | [GenAI]  AI Section Profiling: Labels Batting/Pitching/Fielding for 1-row  |
 * | [GenAI]  Batch Residual AI: Single-call mapping for all unmapped stats     |
 * | [GenAI]  Context Windows: Provides surrounding columns for AI accuracy     |
 * | [Audit]  Visual Reconciliation: AI-mapped columns highlighted in blue      |
 * | [Audit]  Detailed Metrics: Source/aligned/missing/extra/AI mapping counts  |
 * | [Core]   ScriptLock: Prevents concurrent runs on large imports             |
 * +-----------------------------------------------------------------------------+
 *
 * +-----------------------------------------------------------------------------+
 * |                         PROCESS FLOW                                        |
 * +-----------------------------------------------------------------------------+
 * | 1. Inspect header density to determine 1-row flat vs 2-row sectional       |
 * | 2. Build staging keys (Batting_AVG, Pitching_IP, etc.)                     |
 * | 3. Tier 1: Exact match (staging key = master key)                          |
 * | 4. Tier 2: Synonym match (e.g., "batting average" → Batting_AVG)           |
 * | 5. Tier 3: Identity match (e.g., "#" → General_Number)                     |
 * | 6. Tier 4: Batch AI residual mapping with context windows                  |
 * | 7. Filter junk rows, align data, log reconciliation                        |
 * | 8. Append to Raw_Stats with yellow highlighting                            |
 * +-----------------------------------------------------------------------------+
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * Global configuration for the Stats Align Pipeline.
 */
const CONFIG = {
  VERSION: "3.0",
  AI_MODEL: "gemini-2.5-flash-preview-09-2025",
  COLORS: {
    AI_MATCH: "#d9e9ff",
    SUCCESS_BG: "#fff2cc",
  },
};

/**
 * Human-friendly header phrases mapped to standardized master keys.
 */
const SYNONYM_MAP = {
  "first name": "General_First",
  "last name": "General_Last",
  "jersey number": "General_Number",
  team: "General_Team",
  "games played": "Batting_GP",
  "plate appearances": "Batting_PA",
  "batting average": "Batting_AVG",
  "quality at-bats": "Batting_QAB",
  "runs batted in": "Batting_RBI",
  hits: "Batting_H",
  "on-base percentage": "Batting_OBP",
  "slugging percentage": "Batting_SLG",
  "on-base percentage + slugging percentage": "Batting_OPS",
  doubles: "Batting_2B",
  triples: "Batting_3B",
  "home runs": "Batting_HR",
  "innings pitched": "Pitching_IP",
  "earned run average": "Pitching_ERA",
  wins: "Pitching_W",
  strikeouts: "Pitching_SO",
  "walks hits innings pitched": "Pitching_WHIP",
  "batting average against": "Pitching_BAA",
  "fielding percentage": "Fielding_FPCT",
  putouts: "Fielding_PO",
};

// ============================================================================
// MENU ENTRY POINTS
// ============================================================================

/**
 * Adds the GC Automation menu for running the Stats Align pipeline
 * and opening the Automation Logs sheet.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("GC Automation")
    .addItem("Import & Align Staging Data", "aggregateAndAlignStats")
    .addSeparator()
    .addItem("View Automation Logs", "openLogsSheet")
    .addToUi();
}

// ============================================================================
// CORE PIPELINE ENTRY POINT
// ============================================================================

/**
 * Main execution function for the Stats Align pipeline.
 *
 * High-level steps:
 * 1) Inspect Staging header structure (1-row vs 2-row sectional).
 * 2) Build staging keys and master keys.
 * 3) Perform tiered mapping (Exact, Synonym, Identity, Batch AI).
 * 4) Filter and align player rows.
 * 5) Log reconciliation details and append to Raw_Stats.
 */
function aggregateAndAlignStats() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stagingSheet = ss.getSheetByName("Staging");
  const rawStatsSheet = ss.getSheetByName("Raw_Stats");
  const logSheet =
    ss.getSheetByName("Automation_Logs") || ss.insertSheet("Automation_Logs");
  const tz = ss.getSpreadsheetTimeZone();
  const timestamp = Utilities.formatDate(
    new Date(),
    tz,
    "yyyy-MM-dd HH:mm:ss z",
  );

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    ui.alert("⚠️ System busy.");
    return;
  }

  try {
    // 1) Read full Staging data and ensure minimum structure
    const fullStagingData = stagingSheet.getDataRange().getValues();
    if (fullStagingData.length < 2)
      throw new Error(
        "Staging sheet needs at least headers and one row of data.",
      );

    // 2) Dynamic header determination: 2-row sectional vs 1-row worded
    const row1 = fullStagingData[0];
    const row2 = fullStagingData[1];
    const r1Filled = row1.filter((c) => c.toString().trim() !== "").length;
    const r2Filled = row2.filter((c) => c.toString().trim() !== "").length;

    let stagingKeys, stagingData, stagingHeaderNames;

    if (r1Filled < r2Filled * 0.5) {
      stagingKeys = createSectionHeaderArray(row1, row2);
      stagingHeaderNames = row2;
      stagingData = fullStagingData.slice(2);
    } else {
      stagingKeys = generateAISectionProfile(row1);
      stagingHeaderNames = row1;
      stagingData = fullStagingData.slice(1);
    }

    // 3) Master prep: build master keys & column map from Raw_Stats
    const masterFullRange = rawStatsSheet
      .getRange(1, 1, 2, rawStatsSheet.getLastColumn())
      .getValues();
    const masterKeys = createSectionHeaderArray(
      masterFullRange[0],
      masterFullRange[1],
    );
    const masterColMap = {};
    masterKeys.forEach((key, idx) => {
      if (key) masterColMap[key] = idx;
    });

    let finalMap = {};
    let unmappedIndices = [];
    let aiMappedKeys = [];

    // 4) Tiered mapping (Tiers 1–3: Exact, Synonym, Identity)
    stagingKeys.forEach((sKey, idx) => {
      if (!sKey) return;
      const hTextLower = (stagingHeaderNames[idx] || "")
        .toString()
        .toLowerCase()
        .trim();

      if (masterColMap[sKey] !== undefined) {
        finalMap[sKey] = sKey;
      } else if (SYNONYM_MAP[hTextLower]) {
        finalMap[sKey] = SYNONYM_MAP[hTextLower];
      } else if (headerIsIdentity(hTextLower)) {
        finalMap[sKey] = "General_" + mapIdentity(hTextLower);
      } else if (!hTextLower.includes("(rank)")) {
        unmappedIndices.push(idx);
      }
    });

    // 5) Refactored Tier 4: Batch residual AI mapping
    if (unmappedIndices.length > 0) {
      const availableMaster = masterKeys.filter(
        (k) => !Object.values(finalMap).includes(k),
      );
      const sourceTargets = unmappedIndices.map((i) => ({
        key: stagingKeys[i],
        context: stagingHeaderNames.slice(Math.max(0, i - 5), i + 6).join(", "),
      }));

      const batchMappings = callBatchResidualAI(sourceTargets, availableMaster);

      for (const [sKey, mKey] of Object.entries(batchMappings)) {
        if (mKey && masterColMap[mKey] !== undefined) {
          finalMap[sKey] = mKey;
          aiMappedKeys.push(mKey);
        }
      }
    }

    // 6) Reconciliation and data processing
    let totalStatsInSource = 0,
      alignedCount = 0;
    let visualAuditRow = new Array(masterFullRange[1].length).fill("");

    stagingKeys.forEach((sKey, idx) => {
      const hText = stagingHeaderNames[idx];
      if (hText && !hText.toString().toLowerCase().includes("rank")) {
        totalStatsInSource++;
        const target = finalMap[sKey];
        if (target && masterColMap[target] !== undefined) {
          alignedCount++;
          visualAuditRow[masterColMap[target]] = hText;
        }
      }
    });

    const alignedRes = processPlayerData(
      stagingData,
      stagingKeys,
      finalMap,
      masterColMap,
      masterFullRange[1].length,
    );
    if (alignedRes.data.length === 0)
      throw new Error("No player rows aligned.");

    // 7) Logging and data injection into Raw_Stats
    const missingInSource = masterKeys.filter(
      (k) => k && !Object.values(finalMap).includes(k),
    ).length;
    const extraInSource = totalStatsInSource - alignedCount;
    const reconMsg = `${totalStatsInSource} source stats, ${alignedCount} aligned, ${missingInSource} missing, ${extraInSource} extra, ${aiMappedKeys.length} AI Mappings`;

    logData(
      logSheet,
      timestamp,
      reconMsg,
      alignedRes.playerRange,
      masterFullRange[1],
      visualAuditRow,
      aiMappedKeys,
      masterColMap,
    );

    rawStatsSheet
      .getRange(
        rawStatsSheet.getLastRow() + 1,
        1,
        alignedRes.data.length,
        masterFullRange[1].length,
      )
      .setValues(alignedRes.data)
      .setBackground(CONFIG.COLORS.SUCCESS_BG);

    const alertMsg = `${alignedRes.playerRange}\n\n${reconMsg}`;
    ui.alert("Import Successful", alertMsg, ui.ButtonSet.OK);
  } catch (err) {
    logSheet.appendRow([timestamp, "❌ FAILED", err.message, "---", "---"]);
    ui.alert("⚠️ Error: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// AI MAPPING UTILITIES
// ============================================================================

/**
 * Optimized batch AI logic: maps all residual stats in a single API call.
 *
 * @param {Array<{key: string, context: string}>} sources - Unmapped stat keys with context.
 * @param {string[]} masterOptions - Master keys that are still available to map to.
 * @return {Object<string, string|null>} Map of source key → master key (or null).
 */
function callBatchResidualAI(sources, masterOptions) {
  if (sources.length === 0) return {};

  const sourcesText = sources
    .map((s) => `[Stat: "${s.key}", Context: "${s.context}"]`)
    .join("\n");
  const prompt = `Map these baseball stat headers to the best MASTER keys.
  MASTER OPTIONS: ${masterOptions.join(", ")}
  
  SOURCE DATA:
  ${sourcesText}
  
  Return a JSON object: {"Source_Key": "Master_Key"}
  If no strong match exists, return null for that key. Only use keys from MASTER OPTIONS.`;

  try {
    const resp = callGemini(prompt, true);
    return JSON.parse(resp);
  } catch (e) {
    console.error("Batch AI Failed: " + e.message);
    return {};
  }
}

/**
 * AI logic that profiles a single row of headers and determines
 * whether each column belongs to Batting, Pitching, Fielding, or General.
 *
 * @param {string[]} headers - Raw header text from the staging sheet.
 * @return {string[]} Array of section-prefixed keys, same length as headers.
 */
function generateAISectionProfile(headers) {
  const prompt = `Analyze these baseball headers and categorize them into sections: Batting, Pitching, Fielding, or General.
  Headers: ${headers.join(" | ")}
  Rules: IP/ERA/WHIP define Pitching. AVG/HR/RBI define Batting. PO/A/E define Fielding. Name/Number/Team are General.
  Return JSON array of strings: ["Section_HeaderName", ...] exactly matching the input array length.`;
  const resp = callGemini(prompt, true);
  return JSON.parse(resp);
}

/**
 * Processes staging data rows, filters out junk (totals, glossary, blanks),
 * and returns aligned player rows ready for insertion into Raw_Stats.
 *
 * @param {any[][]} data - Staging data rows (after header rows).
 * @param {string[]} keys - Staging section keys per column.
 * @param {Object<string, string>} map - Mapping of staging key → master key.
 * @param {Object<string, number>} colMap - Master key → master column index.
 * @param {number} rowLength - Total columns in the master sheet.
 * @return {{data: any[][], playerRange: string}} Cleaned rows and summary string.
 */
function processPlayerData(data, keys, map, colMap, rowLength) {
  let aligned = [];
  let names = [];
  data.forEach((row) => {
    const rowString = row.join("").trim();
    if (rowString === "") return;

    const isJunk = row.some((cell) => {
      const val = (cell || "").toString().toLowerCase();
      return val.includes("total") || val.includes("glossary");
    });
    if (isJunk) return;

    let newRow = new Array(rowLength).fill("");
    let matchedCount = 0;
    let hasIdentity = false;
    let pLast = "Unknown",
      pNum = "";

    row.forEach((cell, idx) => {
      let target = map[keys[idx]];
      if (target && colMap[target] !== undefined) {
        newRow[colMap[target]] = cell;
        matchedCount++;

        if (
          target.includes("Last") ||
          target.includes("First") ||
          target.includes("Name")
        ) {
          const cellVal = (cell || "").toString().trim();
          if (cellVal !== "") {
            hasIdentity = true;
            if (target.includes("Last")) pLast = cellVal;
          }
        }
        if (target.includes("Number")) pNum = (cell || "").toString().trim();
      }
    });

    if (matchedCount > 1 && hasIdentity) {
      aligned.push(newRow);
      const displayName = pNum ? `${pNum} ${pLast}` : pLast;
      names.push(displayName);
    }
  });

  let playerRangeStr = `Imported ${names.length} players`;
  if (names.length > 0) {
    playerRangeStr += ` between ${names[0]} to ${names[names.length - 1]}`;
  }

  return { data: aligned, playerRange: playerRangeStr };
}

/**
 * Handles visual audit logging into the Automation_Logs sheet, including:
 * - A success header row with master headers.
 * - A staging-to-master reconciliation row with AI mappings highlighted.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Automation_Logs sheet.
 * @param {string} ts - Timestamp string.
 * @param {string} recon - Reconciliation summary message.
 * @param {string} range - Human-readable player range description.
 * @param {any[]} masterHeaders - Second row of Raw_Stats (stat names).
 * @param {any[]} auditRow - Visual audit row aligned to master headers.
 * @param {string[]} aiKeys - Master keys that were filled via AI.
 * @param {Object<string, number>} colMap - Master key → master column index.
 */
function logData(
  sheet,
  ts,
  recon,
  range,
  masterHeaders,
  auditRow,
  aiKeys,
  colMap,
) {
  sheet.appendRow([
    ts,
    "✅ SUCCESS (v" + CONFIG.VERSION + ")",
    range,
    "Raw Stats ->",
    ...masterHeaders,
  ]);
  let lastFilledIdx = -1;
  for (let i = auditRow.length - 1; i >= 0; i--) {
    if (auditRow[i] !== "") {
      lastFilledIdx = i;
      break;
    }
  }
  const trimmed =
    lastFilledIdx === -1 ? [] : auditRow.slice(0, lastFilledIdx + 1);
  sheet.appendRow([ts, "", recon, "Staging ->"].concat(trimmed));

  const lastRow = sheet.getLastRow();
  aiKeys.forEach((mKey) => {
    const colIdx = colMap[mKey] + 5;
    if (colIdx <= sheet.getLastColumn())
      sheet.getRange(lastRow, colIdx).setBackground(CONFIG.COLORS.AI_MATCH);
  });
  sheet
    .getRange(lastRow, 1, 1, sheet.getLastColumn())
    .setBorder(
      null,
      null,
      true,
      null,
      null,
      null,
      "#444444",
      SpreadsheetApp.BorderStyle.SOLID,
    );
}

// ============================================================================
// HEADER & IDENTITY HELPERS
// ============================================================================

/**
 * Builds an array of section-prefixed header keys from a 2-row header.
 *
 * Row1 contains section labels (Batting/Pitching/Fielding), row2 contains
 * individual stat names.
 *
 * @param {any[]} r1 - First header row (section labels).
 * @param {any[]} r2 - Second header row (stat names).
 * @return {Array<string|null>} Array of "Section_Stat" keys or null.
 */
function createSectionHeaderArray(r1, r2) {
  let sec = "General";
  return r2.map((h, i) => {
    let v = (r1[i] || "").toString().toLowerCase();
    if (v.includes("batting") || v.includes("hitting")) sec = "Batting";
    else if (v.includes("pitching")) sec = "Pitching";
    else if (v.includes("fielding")) sec = "Fielding";
    return h ? sec + "_" + h.toString().trim() : null;
  });
}

/**
 * Returns true if a lowercased header string appears to describe
 * an identity field (name, number, team).
 *
 * @param {string} text
 * @return {boolean}
 */
function headerIsIdentity(text) {
  return ["first", "last", "name", "#", "number", "jersey", "team"].some((i) =>
    text.includes(i),
  );
}

/**
 * Maps a lowercased identity header string to a canonical identity key
 * component (First, Last, Number, Team, or Name).
 *
 * @param {string} text
 * @return {string}
 */
function mapIdentity(text) {
  if (text.includes("first")) return "First";
  if (text.includes("last")) return "Last";
  if (text.includes("#") || text.includes("number")) return "Number";
  if (text.includes("team")) return "Team";
  return "Name";
}

// ============================================================================
// GEMINI CLIENT
// ============================================================================

/**
 * Low-level Gemini client helper. Sends a prompt to the configured
 * AI model and returns the raw text from the first candidate.
 *
 * @param {string} prompt - Prompt text.
 * @param {boolean} [isJson=false] - Whether to request JSON-formatted output.
 * @return {string} Raw text/JSON string from Gemini.
 */
function callGemini(prompt, isJson = false) {
  const apiKey =
    PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.AI_MODEL}:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  if (isJson)
    payload.generationConfig = { responseMimeType: "application/json" };
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  const resp = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(resp.getContentText());
  if (json.error) throw new Error("API Error: " + json.error.message);
  return json.candidates[0].content.parts[0].text;
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Activates the Automation_Logs sheet if it exists.
 */
function openLogsSheet() {
  const s =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Automation_Logs");
  if (s) s.activate();
}
