/**
 * PROJECT OVERVIEW: Seasonal Player Data Synchronization
 * ==============================================================================
 * This script serves as the central intelligence for youth baseball draft
 * preparations. It automates the complex task of matching registration records,
 * performance stats, and challenge assignments.
 *
 * CURRENT VERSION: 1.0
 * +---------------------------------------------------------------------------------------------------+
 * |                                      CHANGE LOG                                                   |
 * +---------+-------------+---------------------------------------------------------------------------+
 * | VERSION | DATE        | DESCRIPTION                                                               |
 * +---------+-------------+---------------------------------------------------------------------------+
 * | 1.0     | 2026-01-19  | Core sync and logging baseline (UI exposes Update Draft Stats only).      |
 * +---------+-------------+---------------------------------------------------------------------------+
 * * +---------------------------------------------------------------------------------------------------+
 * |                                      FEATURES LIST                                                |
 * +---------------------------------------------------------------------------------------------------+
 * | [Core]   Data Synchronization: Automatic updates from Registrations/Challenge to Draft_Stats.      |
 * | [Core]   New Player Addition: Automatically appends unregistered players to the bottom of board.   |
 * | [Core]   Cleanup: Clears automated data for players no longer in the registration system.          |
 * | [Core]   Custom Menus: Integrated Google Sheets UI buttons for manual trigger.                    |
 * | [Core]   Logging: Persistent 'Automation Log' tracking with Success/Failed status icons.           |
 * |                                                                                                   |
 * +---------------------------------------------------------------------------------------------------+
 * * +---------------------------------------------------------------------------------------------------+
 * |                                   DATA MAPPING REFERENCE                                          |
 * +-----------------------+-----------------------+---------------------------------------------------+
 * | SOURCE SHEET          | SOURCE COLUMN         | DESTINATION (Draft_Stats)                         |
 * +-----------------------+-----------------------+---------------------------------------------------+
 * | Registrations         | Player Birth Date     | Player Birth Date                                 |
 * | Registrations         | Division Name         | Draft (Abbreviated Mapping)                       |
 * | Registrations         | Special Player Request| Special Player Requests                           |
 * | Challenge             | Team Name             | Challenge                                         |
 * +-----------------------+-----------------------+---------------------------------------------------+
 */

// TO ACTIVATE THIS FILE, REMOVE THE FORWARD SLASH AND ASTERISK ABOVE AND AT THE VERY BOTTOM

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * API key for Gemini. Prefer storing this in project properties
 * and reading it dynamically instead of hard-coding.
 */
const API_KEY = ""; // API key is handled by the environment

/** Name of the log sheet used for sync runs. */
const LOG_SHEET_NAME = "Automation Log";

/**
 * Division name fragments that should be excluded from the draft board.
 * Players in these divisions will have their draft-related fields cleared.
 */
const EXCLUDED_DIV_PATTERNS = [
  "Rookie (Coach Pitch)",
  "Tee Ball",
  "Evaluation",
  "Junior",
];

/**
 * Cell background colors used to flag potential negative coach requests.
 * Adjust these hex values if you want different highlight intensity.
 */
const NEG_COACH_COLORS = {
  POSSIBLE: "#f4c7c3", // light pink
  STRONG: "#ea9999", // stronger red/pink
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

/** Enable extra logging for Negative Coach Assistant (writes to NegCoach_Debug sheet). */
const NEG_COACH_DEBUG = false;

// ============================================================================
// MENU ENTRY POINTS
// ============================================================================

/**
 * Adds the "Gamechanger" menu.
 *
 * v1.0: Only the core "Update Draft Stats" action is exposed.
 * The AI Tools submenu is present in code but commented out here
 * so end users do not see or invoke those helpers.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // To re-enable AI tools in a future 2.0, uncomment the block below
  // and add the submenu back onto the Gamechanger menu.
  // const aiToolsMenu = ui
  //   .createMenu("AI Tools")
  //   .addItem("Negative Coach Request Assistant", "runNegativeCoachAssistant")
  //   .addItem("Scouting Assistant", "askGeminiAdHoc")
  //   .addItem("Draft Insights", "aiDraftSummary");

  ui.createMenu("Gamechanger")
    .addItem("Update Draft Stats", "updateStatsFromRegistrations")
    .addToUi();
}

// ============================================================================
// CORE SYNC LOGIC
// ============================================================================

/**
 * Syncs Draft_Stats with Registrations and Challenge sheets.
 *
 * - Updates DOB, Draft, Special Requests, and Challenge for existing players.
 * - Clears data for players no longer in the registration system or
 *   in non-draft (excluded) divisions.
 * - Appends new players that appear only in Registrations.
 */
function updateStatsFromRegistrations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const statsSheet = ss.getSheetByName("Draft_Stats");
  const regSheet = ss.getSheetByName("Registrations");
  const chalSheet = ss.getSheetByName("Challenge");

  // 1) Ensure log sheet exists and has headers
  let logSheet =
    ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet
      .getRange(1, 1, 1, 4)
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
  }

  // Counters for summary logging
  let uniqueUpdated = new Set();
  let uniqueCleared = new Set();
  let newPlayerCount = 0;

  try {
    // 2) Basic sheet existence validation
    if (!statsSheet || !regSheet || !chalSheet) {
      throw new Error(
        "Required tabs (Draft_Stats, Registrations, or Challenge) are missing.",
      );
    }

    // 3) Build header maps for each sheet
    const statsHeaders = statsSheet
      .getRange(1, 1, 1, statsSheet.getLastColumn())
      .getValues()[0];
    const regHeaders = regSheet
      .getRange(6, 1, 1, regSheet.getLastColumn())
      .getValues()[0];
    const chalHeaders = chalSheet
      .getRange(1, 1, 1, chalSheet.getLastColumn())
      .getValues()[0];

    const statsMap = getMap(statsHeaders);
    const regMap = getMap(regHeaders);
    const chalMap = getMap(chalHeaders);

    // 4) Build lookup maps from Registrations and Challenge
    const registrationsMap = new Map();
    const regData = regSheet
      .getRange(
        7,
        1,
        Math.max(regSheet.getLastRow() - 6, 1),
        regSheet.getLastColumn(),
      )
      .getValues();
    regData.forEach((row) => {
      const name =
        `${row[regMap["player first name"]]} ${row[regMap["player last name"]]}`.trim();
      if (name && name !== "undefined undefined") {
        registrationsMap.set(name, {
          birth: row[regMap["player birth date"]],
          div: row[regMap["division name"]],
          spec: row[regMap["special player request"]],
        });
      }
    });

    const challengeMap = new Map();
    const chalData = chalSheet.getDataRange().getValues();
    chalData.slice(1).forEach((row) => {
      const name =
        `${row[chalMap["player first name"]]} ${row[chalMap["player last name"]]}`.trim();
      challengeMap.set(name, row[chalMap["team name"]]);
    });

    // 5) Walk existing Draft_Stats rows and update/clear as needed
    const statsRange = statsSheet.getRange(
      2,
      1,
      Math.max(statsSheet.getLastRow() - 1, 1),
      statsSheet.getLastColumn(),
    );
    const statsValues = statsRange.getValues();
    const existingPlayersInDraftStats = new Set();

    const finalValues = statsValues.map((row) => {
      const name =
        `${row[statsMap["player first name"]]} ${row[statsMap["player last name"]]}`.trim();
      if (!name || name === "undefined undefined") return row;

      existingPlayersInDraftStats.add(name);

      if (registrationsMap.has(name)) {
        const reg = registrationsMap.get(name);
        const excluded = isExcludedDiv(reg.div);

        const newBirth = excluded ? "" : reg.birth;
        const newDraft = excluded ? "" : shortenDiv(reg.div);
        const newSpec = reg.spec || "";
        const team = challengeMap.get(name);
        const newChal =
          team && team !== "Unallocated" ? team : row[statsMap["challenge"]];

        const hasChanges =
          String(row[statsMap["player birth date"]]) !== String(newBirth) ||
          String(row[statsMap["draft"]]) !== String(newDraft) ||
          String(row[statsMap["special player requests"]]) !==
            String(newSpec) ||
          String(row[statsMap["challenge"]]) !== String(newChal);

        if (hasChanges) {
          row[statsMap["player birth date"]] = newBirth;
          row[statsMap["draft"]] = newDraft;
          row[statsMap["special player requests"]] = newSpec;
          row[statsMap["challenge"]] = newChal;
          uniqueUpdated.add(name);
        }
      } else {
        const hasData =
          row[statsMap["player birth date"]] ||
          row[statsMap["draft"]] ||
          row[statsMap["challenge"]];
        if (hasData) {
          [
            statsMap["player birth date"],
            statsMap["draft"],
            statsMap["challenge"],
            statsMap["special player requests"],
          ].forEach((idx) => (row[idx] = ""));
          uniqueCleared.add(name);
        }
      }
      return row;
    });

    if (statsValues.length > 0) statsRange.setValues(finalValues);

    // 6) Append new players that are only in Registrations
    const newRows = [];
    registrationsMap.forEach((reg, name) => {
      if (!existingPlayersInDraftStats.has(name) && !isExcludedDiv(reg.div)) {
        const parts = name.split(" ");
        const newRow = new Array(statsHeaders.length).fill("");

        newRow[statsMap["player first name"]] = parts[0];
        newRow[statsMap["player last name"]] = parts.slice(1).join(" ");
        newRow[statsMap["player birth date"]] = reg.birth;
        newRow[statsMap["draft"]] = shortenDiv(reg.div);
        newRow[statsMap["special player requests"]] = reg.spec;
        newRow[statsMap["challenge"]] = challengeMap.get(name) || "";

        newRows.push(newRow);
        newPlayerCount++;
      }
    });

    if (newRows.length > 0) {
      statsSheet
        .getRange(
          statsSheet.getLastRow() + 1,
          1,
          newRows.length,
          statsHeaders.length,
        )
        .setValues(newRows);
    }

    // 7) Log summary and show user notification
    const totalProcessed =
      uniqueUpdated.size + uniqueCleared.size + newPlayerCount;
    const summaryData =
      `Total Players Processed: (${totalProcessed}) --- ` +
      `Players Updated (existing players): (${uniqueUpdated.size}) --- ` +
      `Players Cleared (unregistered): (${uniqueCleared.size}) --- ` +
      `Players Added (new players): (${newPlayerCount})`;

    logSheet.appendRow([new Date(), "Script", "✅ Success", summaryData]);

    const popupRows = [
      ["Total Players Processed:", totalProcessed],
      ["Players Updated (existing players):", uniqueUpdated.size],
      ["Players Cleared (unregistered):", uniqueCleared.size],
      ["Players Added (new players):", newPlayerCount],
    ];
    const maxLabelLen = popupRows.reduce(
      (max, [label]) => Math.max(max, label.length),
      0,
    );
    const popupText = popupRows
      .map(([label, value]) => label.padEnd(maxLabelLen + 2) + value)
      .join("\n");

    SpreadsheetApp.getUi().alert(popupText);
  } catch (e) {
    logSheet.appendRow([new Date(), "Script", "❌ Failed", e.message]);
    SpreadsheetApp.getUi().alert("❌ Sync Error\n\n" + e.message);
  }
}

// ============================================================================
// AI TOOLS (SCOUTING & DRAFT INSIGHTS)
// ============================================================================

/**
 * Scans the "Special Player Requests" column for polite or explicit
 * requests to avoid specific coaches, teams, or families.
 *
 * Behavior:
 * - Uses a cautious league-admin persona (not a scout).
 * - Errs on the side of caution: ambiguous notes become at least POSSIBLE flags.
 * - Colors the Special Player Requests cells:
 *   - STRONG concerns  → stronger red/pink.
 *   - POSSIBLE concerns → lighter pink.
 */
function runNegativeCoachAssistant() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Draft_Stats");

  if (!sheet) {
    ui.alert("Draft_Stats sheet is missing. Unable to scan requests.");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerMap = getMap(headers);
  const specialReqColIdx = headerMap["special player requests"];

  if (specialReqColIdx === undefined) {
    ui.alert(
      'Column "Special Player Requests" was not found in Draft_Stats. ' +
        "Please confirm the header spelling.",
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

  // Clear any previous highlights in this column
  requestRange.setBackground(null);

  let strongCount = 0;
  let possibleCount = 0;

  // Build a background matrix so we can apply colors in one batch.
  const bgMatrix = Array.from({ length: numRows }, () => [null]);

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

  if (items.length > 0) {
    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = items.slice(start, start + BATCH_SIZE);

      let labels;
      try {
        labels = callGeminiForRequestBatch(batch);
      } catch (e) {
        // On failure, err on the side of caution for this batch
        labels = {};
        batch.forEach((item) => {
          labels[item.index] = "FLAG_POSSIBLE";
        });
      }

      batch.forEach((item) => {
        const classification = (labels[item.index] || "SAFE")
          .toString()
          .trim()
          .toUpperCase();

        if (classification.startsWith("FLAG_STRONG")) {
          bgMatrix[item.index][0] = NEG_COACH_COLORS.STRONG;
          strongCount++;
        } else if (classification.startsWith("FLAG_POSSIBLE")) {
          bgMatrix[item.index][0] = NEG_COACH_COLORS.POSSIBLE;
          possibleCount++;
        }
      });
    }
  }

  requestRange.setBackgrounds(bgMatrix);
  const flaggedCount = strongCount + possibleCount;

  // Log to Automation Log
  let logSheet =
    ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
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
    `Agent: (Negative Coach Assistant) --- Model: (gemini-2.5-flash-preview-09-2025) --- ` +
    `Possible requests flagged for review (${flaggedCount}) --- ` +
    `Notes scanned: (${notesScanned}) --- ` +
    `Sent to AI: (${sentToAi}) --- ` +
    `Batches planned: (${batchesPlanned}) --- ` +
    `Approx note tokens this run: (${approxTokens} estimate)`;

  logSheet.appendRow([new Date(), "AI", "✅ Success", logMessage]);

  ui.alert(
    "Negative Coach Request Assistant",
    `Scan complete.\n\nPossible requests flagged for review (${flaggedCount})`,
    ui.ButtonSet.OK,
  );
}

/**
 * Generates a 3-sentence scouting report for the currently selected player row
 * in the Draft_Stats sheet using Gemini.
 */
function askGeminiAdHoc() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Draft_Stats");
  const activeRange = sheet.getActiveRange();
  const row = activeRange.getRow();

  if (row < 2) {
    SpreadsheetApp.getUi().alert("Please select a player row first.");
    return;
  }

  const data = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  let playerInfo = "";
  headers.forEach((h, i) => {
    if (data[i]) playerInfo += `${h}: ${data[i]}\n`;
  });

  const prompt = `Analyze this baseball player and provide a concise 3-sentence scouting report.\n\nPLAYER DATA:\n${playerInfo}`;
  const response = callGemini(prompt);
  // Log AI Scout Assistant usage
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet =
    ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet
      .getRange(1, 1, 1, 4)
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
  }

  const scoutLog = `Scout Assistant run. Agent: (Scout Assistant) --- Model: (gemini-2.5-flash-preview-09-2025) --- Player row: (${row}).`;
  logSheet.appendRow([new Date(), "AI", "✅ Success", scoutLog]);

  showAiDialog("Scout Report", response);
}

/**
 * Analyzes the top portion of the draft board and returns an
 * executive-style summary of talent trends using Gemini.
 */
function aiDraftSummary() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Draft_Stats");
  const data = sheet
    .getRange(1, 1, Math.min(sheet.getLastRow(), 50), sheet.getLastColumn())
    .getValues();
  const prompt = `Analyze this draft board and provide a high-level executive summary including top talent trends.\n\nDATA:\n${JSON.stringify(data)}`;
  const response = callGemini(prompt);
  // Log AI Draft Insights usage
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet =
    ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet
      .getRange(1, 1, 1, 4)
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
  }

  const rowsAnalyzed = Math.min(sheet.getLastRow(), 50);
  const summaryLog = `Draft Insights run. Agent: (Draft Insights) --- Model: (gemini-2.5-flash-preview-09-2025) --- Rows analyzed: (${rowsAnalyzed}).`;
  logSheet.appendRow([new Date(), "AI", "✅ Success", summaryLog]);

  showAiDialog("AI Draft Insights & Executive Summary", response);
}

/**
 * Gemini caller for batched negative coach request analysis.
 * Uses JSON mode to return a mapping of row index → label.
 *
 * @param {{index:number,text:string}[]} items - Array of requests with row indices.
 * @return {Object<number,string>} Map of index -> FLAG_STRONG | FLAG_POSSIBLE | SAFE.
 */
function callGeminiForRequestBatch(items) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
  const list = items
    .map(
      (it) => `{ "index": ${it.index}, "request": ${JSON.stringify(it.text)} }`,
    )
    .join(",\n  ");

  const prompt =
    "ROLE & GOAL:\n" +
    'You are a cautious youth baseball league administrator reviewing parent "Special Player Request" notes.\n' +
    "Your ONLY task is to detect whether a parent is trying to keep their child off a specific coach's team or away from a particular family.\n" +
    "Err on the side of caution, especially for any polite or indirect wording.\n\n" +
    "INPUT:\n" +
    "You will receive a JSON array of objects: [{ index: number, request: string }].\n" +
    "Each 'request' is a single parent's note from the Special Player Requests column.\n\n" +
    "LABELING RULES:\n" +
    "- FLAG_STRONG   = clear, explicit request to AVOID a specific coach, team, or family (e.g. prior bad experience, conflict, safety concern).\n" +
    '- FLAG_POSSIBLE = polite but still indicates avoiding or not wanting a specific coach/team/family (e.g. "would rather not be with Coach X again").\n' +
    "- SAFE          = all other cases, including neutral or positive mentions of coaches, teams, or friends.\n" +
    "- DO NOT mark FLAG_STRONG or FLAG_POSSIBLE just because a coach name or the word 'coach' appears. There must be negative or avoidant language in the sentence (not, avoid, don't want, rather not, bad experience, conflict, issue, etc.).\n" +
    "- When truly uncertain, choose SAFE.\n" +
    '- Examples that are SAFE: "wants to play for Coach Smith again", "would love to be with Coach Jones", "hopes to be with friends on Coach Lee\'s team".\n' +
    "EXAMPLES (YOU MUST FOLLOW):\n" +
    '1) "Request to be with a seasoned coach who understands and will work towards player development - had a new coach last fall and it was a bit of a bust" => FLAG_POSSIBLE.\n' +
    '2) "He would prefer not to play for the Twins, he would not be a good fit with the coach." => FLAG_STRONG.\n' +
    '3) "I kindly request that Owen not be placed on a team coached by Greg Nowick. Thank you!" => FLAG_STRONG.\n' +
    '4) "Please, do not put on Stoffey teams. We have never requested anything but it was not a great experience." => FLAG_STRONG.\n\n' +
    "OUTPUT FORMAT:\n" +
    "Return a JSON object mapping row index to label. Example:\n" +
    '{ "0": "FLAG_POSSIBLE", "5": "SAFE" }\n\n' +
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
      temperature: 0.1,
    },
  };

  let response;
  for (let i = 0; i < 5; i++) {
    try {
      response = UrlFetchApp.fetch(url, {
        method: "POST",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      if (response.getResponseCode() === 200) break;
      Utilities.sleep(Math.pow(2, i) * 1000);
    } catch (e) {
      if (i === 4) throw e;
      Utilities.sleep(Math.pow(2, i) * 1000);
    }
  }
  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText();

  if (NEG_COACH_DEBUG) {
    logNegCoachDebug_("BATCH_RESPONSE", {
      statusCode,
      itemsCount: items.length,
      bodySnippet: bodyText.slice(0, 500),
    });
  }

  const outer = JSON.parse(bodyText);
  const rawText = outer.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    // Fall back: mark all as SAFE to avoid noisy false positives
    if (NEG_COACH_DEBUG) {
      logNegCoachDebug_("NO_RAWTEXT", {
        outerSnippet: JSON.stringify(outer).slice(0, 500),
      });
    }
    const fallback = {};
    items.forEach((it) => {
      fallback[it.index] = "SAFE";
    });
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawText);
    if (NEG_COACH_DEBUG) {
      logNegCoachDebug_("PARSED_LABELS", {
        labels: parsed,
        sampleRequests: items.slice(0, 5),
      });
    }
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    if (NEG_COACH_DEBUG) {
      logNegCoachDebug_("PARSE_ERROR", {
        error: String(e),
        rawTextSnippet: rawText.slice(0, 500),
      });
    }
    const fallback = {};
    items.forEach((it) => {
      fallback[it.index] = "SAFE";
    });
    return fallback;
  }
}

/**
 * Calls the Gemini model and returns the first text candidate, with
 * basic retry and a safe fallback.
 *
 * @param {string} prompt - The prompt text to send to Gemini.
 * @return {string} Generated text or a fallback message.
 */
function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [
        {
          text: "You are a professional baseball scout. Your tone is analytical and concise.",
        },
      ],
    },
  };

  let response;
  for (let i = 0; i < 5; i++) {
    try {
      response = UrlFetchApp.fetch(url, {
        method: "POST",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      if (response.getResponseCode() === 200) break;
      Utilities.sleep(Math.pow(2, i) * 1000);
    } catch (e) {
      if (i === 4) throw e;
      Utilities.sleep(Math.pow(2, i) * 1000);
    }
  }

  const json = JSON.parse(response.getContentText());
  return (
    json.candidates?.[0]?.content?.parts?.[0]?.text || "Scout unavailable."
  );
}

/**
 * Displays AI output in a modal dialog for easier reading.
 *
 * @param {string} title   - Dialog title.
 * @param {string} content - HTML/text content to display.
 */
function showAiDialog(title, content) {
  const html = `<div style="font-family: sans-serif; padding: 10px;"><div style="white-space: pre-wrap; font-size: 13px;">${content}</div></div>`;
  const output = HtmlService.createHtmlOutput(html)
    .setWidth(450)
    .setHeight(350);
  SpreadsheetApp.getUi().showModalDialog(output, title);
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
 * Converts verbose division names into shorter draft labels.
 *
 * @param {string|any} n - Raw division name value.
 * @return {string} Shortened division label.
 */
function shortenDiv(n) {
  if (!n) return "";
  const div = n.toString();

  if (div.includes("IMP Machine Pitch")) return "IMP";
  if (div.includes("AMP Machine Pitch")) return "AMP";
  if (div.includes("Majors")) return "Majors";
  if (div.includes("Minor - Player Pitch")) return "Minors";

  return div.split(/[-/]/)[0].replace("Little League Baseball", "").trim();
}

/**
 * Returns true if a division name belongs to a non-draft (excluded) group.
 *
 * @param {string|any} divName - Division name from Registrations.
 * @return {boolean} Whether the division is excluded from the draft.
 */
function isExcludedDiv(divName) {
  if (!divName) return false;
  const dn = divName.toString();

  return EXCLUDED_DIV_PATTERNS.some((pattern) => dn.includes(pattern));
}

/**
 * Internal helper: logs Negative Coach Assistant debug info
 * into a NegCoach_Debug sheet without interrupting main flow.
 */
function logNegCoachDebug_(event, payload) {
  try {
    // Also send a compact version to the Apps Script log for quick inspection.
    try {
      Logger.log(
        "[NegCoach] %s :: %s",
        event,
        JSON.stringify(payload).slice(0, 1000),
      );
    } catch (logErr) {
      // Ignore logging errors.
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = "NegCoach_Debug";
    let sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Event", "Payload JSON"]);
      sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#f3f3f3");
    }

    sheet.appendRow([
      new Date(),
      event,
      JSON.stringify(payload).slice(0, 50000),
    ]);
  } catch (e) {
    // Swallow errors; debug logging should never break the main script.
  }
}
