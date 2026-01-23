/**
 * PROJECT OVERVIEW: Seasonal Player Data Synchronization & AI Scouting
 * ==============================================================================
 * This script serves as the central intelligence for youth baseball draft
 * preparations. It automates the complex task of matching registration records,
 * performance stats, and challenge assignments.
 *
 * CURRENT VERSION: 2.2
 * +---------------------------------------------------------------------------------------------------+
 * |                                      CHANGE LOG                                                   |
 * +---------+-------------+---------------------------------------------------------------------------+
 * | VERSION | DATE        | DESCRIPTION                                                               |
 * +---------+-------------+---------------------------------------------------------------------------+
 * | 2.2     | 2026-01-23  | Added Sanity Checker: Bi-directional validation between Registration     |
 * |         |             | and Draft_Stats. Identifies orphaned records, missing players, and       |
 * |         |             | generates timestamped report in "Sanity_Check_Results" sheet.            |
 * | 2.1     | 2026-01-23  | Enhanced sync accounting: Added "Already Updated" vs "Updated" tracking, |
 * |         |             | "NOT Updated" verification check, improved UI messaging, workflow docs.   |
 * |         |             | Fixed duplicate registration handling: prioritizes draft-eligible         |
 * |         |             | divisions over excluded divisions when player has multiple registrations. |
 * |         |             | Added comprehensive NAME_MATCHING debug logging with character-code      |
 * |         |             | analysis and DUPLICATE_REG detection.                                     |
 * | 2.0     | 2026-01-15  | [Baseline] Official foundation for AI-integrated lineage.                 |
 * | 1.0     | 2026-01-19  | Core sync and logging baseline (UI exposes Update Draft Stats only).      |
 * +---------+-------------+---------------------------------------------------------------------------+
 * * +-------------------------------------------------------------------------------------------------+
 * |                                      FEATURES LIST                                                |
 * +---------------------------------------------------------------------------------------------------+
 * | [GenAI]  Scout Assistant: On-demand player analysis and roster evaluation via Gemini 2.5.         |
 * | [GenAI]  Draft Insights: Automated draft board summaries and top-talent identification.           |
 * | [GenAI]  Negative Flagging: AI sentiment analysis of "Avoid Coach" requests with RED highlights.  |
 * | [Core]   Data Synchronization: Automatic updates from Registrations/Challenge to Draft_Stats.     |
 * | [Core]   New Player Addition: Automatically appends unregistered players to the bottom of board.  |
 * | [Core]   Cleanup: Clears automated data for players no longer in the registration system.         |
 * | [Core]   Custom Menus: Integrated Google Sheets UI buttons for manual trigger.                    |
 * | [Core]   Logging: Persistent 'Automation Log' tracking with Success/Failed status icons.          |
 * +---------------------------------------------------------------------------------------------------+
 * * +-------------------------------------------------------------------------------------------------+
 * |                                   DATA MAPPING REFERENCE                                          |
 * +-----------------------+-----------------------+---------------------------------------------------+
 * | SOURCE SHEET          | SOURCE COLUMN         | DESTINATION (Draft_Stats)                         |
 * +-----------------------+-----------------------+---------------------------------------------------+
 * | Registrations         | Player Birth Date     | Player Birth Date                                 |
 * | Registrations         | Division Name         | Draft (Abbreviated Mapping)                       |
 * | Registrations         | Special Player Request| Special Player Requests                           |
 * | Challenge             | Team Name             | Challenge                                         |
 * +-----------------------+-----------------------+---------------------------------------------------+
 *
 * +-------------------------------------------------------------------------------------------------+
 * |                              WORKFLOW & MATCHING LOGIC                                            |
 * +-------------------------------------------------------------------------------------------------+
 * PLAYER MATCHING:
 * The script matches players between Registrations and Draft_Stats using exact name matching:
 * - Concatenates "Player First Name" + " " + "Player Last Name" from both sheets
 * - Case-sensitive exact string match ("John Doe" ≠ "Jon Doe")
 * - Whitespace sensitive (leading/trailing spaces or double spaces cause match failures)
 *
 * UPDATE WORKFLOW:
 * 1. Read Registrations (starting row 7) and Challenge sheets into lookup maps
 * 2. For each existing player in Draft_Stats:
 *    a. Match by full name to Registrations
 *    b. If matched AND in draft-eligible division → Update Birth Date, Draft, Special Requests
 *    c. If matched BUT in excluded division (Tee Ball, Rookie, etc.) → Clear those fields
 *    d. If NOT matched → Clear automated fields (player unregistered)
 * 3. Append new players found only in Registrations (not in excluded divisions)
 *
 * EXCLUDED DIVISIONS:
 * Players in these divisions are cleared from the draft board:
 * - Rookie (Coach Pitch), Tee Ball, Evaluation, Junior
 *
 * COUNTING METHODOLOGY:
 * - Unique players only: Multiple rows per player (multi-season history) count as ONE player
 * - Already Updated: Players with Birth Date AND Draft already populated before sync
 * - Updated: Players matched but missing Birth Date OR Draft (newly populated)
 * - Cleared: Players not in current Registrations (fields wiped)
 * - Added: Brand new players appended to bottom of Draft_Stats
 * - NOT Updated: Players in Registrations but not matched/updated in Draft_Stats
 *
 * COMMON MATCH FAILURES:
 * - Name spelling variations ("Jon" vs "John", "Mary-Jane" vs "Mary Jane")
 * - Extra/missing spaces ("John  Doe" with double space)
 * - Nicknames ("Johnny" vs "John")
 * - Middle names or suffixes ("John Michael Doe" vs "John Doe")
 * - Special characters ("O'Brien" vs "OBrien")
 * +-------------------------------------------------------------------------------------------------+
 */

// TO ACTIVATE THIS FILE, REMOVE THE FORWARD SLASH AND ASTERISK ABOVE AND AT THE VERY BOTTOM

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * API key for Gemini. Stored in Script Properties for security.
 * To set: Extensions → Apps Script → Project Settings → Script Properties
 * Add property: GEMINI_API_KEY = your-api-key-here
 */
const API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "";

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

/**
// ============================================================================
// DEBUG CONFIGURATION
// ============================================================================
/**    
 * Enable/disable debug logging per feature. All debug logs go to a single "Debug_Log" sheet.
 * Set any flag to true to enable detailed logging for that feature.
 */
const DEBUG_FLAGS = {
  NEGATIVE_COACH: false,
  SCOUTING_ASSISTANT: false,
  DRAFT_INSIGHTS: false,
  CORE_SYNC: false,
  NAME_MATCHING: true, // Enable to debug name matching issues
};

// ============================================================================
// MENU ENTRY POINTS
// ============================================================================

/**
 * Adds a single consolidated "Gamechanger" menu with:
 * - Update Draft Stats
 * - AI Tools (Negative Coach Assistant, Scouting Assistant, Draft Insights)
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const aiToolsMenu = ui
    .createMenu("AI Tools")
    .addItem("Negative Coach Request Assistant", "runNegativeCoachAssistant")
    .addItem("Ask AI Scouting Assistant", "askGeminiAdHoc");
    // .addItem("Draft Insights", "aiDraftSummary");

  ui.createMenu("Gamechanger")
    .addItem("Update Draft Stats", "updateStatsFromRegistrations")
    .addItem("Run Sanity Checker", "runSanityChecker")
    .addSeparator()
    .addSubMenu(aiToolsMenu)
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
 * - Tracks Already Updated, Updated, Cleared, Added, and NOT Updated categories.
 * - Ensures unique player counting (multiple season rows = 1 player).
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

  // Enhanced counters for improved tracking
  let uniqueAlreadyUpdated = new Set(); // Players already having Birth Date AND Draft populated
  let uniqueUpdated = new Set();         // Players matched and newly updated (were missing data)
  let uniqueCleared = new Set();         // Players removed from registrations
  let newPlayerCount = 0;                // Brand new players added to bottom

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
      const firstName = row[regMap["player first name"]];
      const lastName = row[regMap["player last name"]];
      const name = `${firstName} ${lastName}`.trim();
      
      if (DEBUG_FLAGS.NAME_MATCHING) {
        logDebug("Name Matching", "REG_NAME_BUILD", {
          firstName: firstName,
          lastName: lastName,
          fullName: name,
          firstNameLength: String(firstName).length,
          lastNameLength: String(lastName).length,
          fullNameLength: name.length,
          charCodes: name.split('').map(c => c.charCodeAt(0)).slice(0, 20)
        });
      }
      
      if (name && name !== "undefined undefined") {
        const newReg = {
          birth: row[regMap["player birth date"]],
          div: row[regMap["division name"]],
          spec: row[regMap["special player request"]],
        };
        
        // Handle duplicate registrations: prioritize draft-eligible divisions over excluded divisions
        if (registrationsMap.has(name)) {
          const existingReg = registrationsMap.get(name);
          const existingIsExcluded = isExcludedDiv(existingReg.div);
          const newIsExcluded = isExcludedDiv(newReg.div);
          
          if (DEBUG_FLAGS.NAME_MATCHING) {
            logDebug("Name Matching", "DUPLICATE_REG", {
              playerName: name,
              existingDiv: existingReg.div,
              existingIsExcluded: existingIsExcluded,
              newDiv: newReg.div,
              newIsExcluded: newIsExcluded,
              decision: (newIsExcluded && !existingIsExcluded) ? "KEEP_EXISTING_DRAFT_ELIGIBLE" : "OVERWRITE_WITH_NEW"
            });
          }
          
          // If new division is excluded but existing is draft-eligible, keep existing
          if (newIsExcluded && !existingIsExcluded) {
            return; // Don't overwrite - keep the draft-eligible registration
          }
          // Otherwise overwrite (handles: both excluded, both eligible, or new is eligible)
        }
        
        registrationsMap.set(name, newReg);
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
      const firstName = row[statsMap["player first name"]];
      const lastName = row[statsMap["player last name"]];
      const name = `${firstName} ${lastName}`.trim();
      
      if (!name || name === "undefined undefined") return row;

      existingPlayersInDraftStats.add(name);
      
      if (DEBUG_FLAGS.NAME_MATCHING && (name.includes("Lucas Thomas") || name.includes("Vincent Picone") || name.includes("Lucas Caya"))) {
        logDebug("Name Matching", "DRAFT_NAME_CHECK", {
          draftName: name,
          firstName: firstName,
          lastName: lastName,
          nameLength: name.length,
          charCodes: name.split('').map(c => c.charCodeAt(0)),
          foundInReg: registrationsMap.has(name),
          currentBirth: row[statsMap["player birth date"]],
          currentDraft: row[statsMap["draft"]],
          regMapKeys: Array.from(registrationsMap.keys()).filter(k => k.includes("Lucas") || k.includes("Vincent"))
        });
      }

      if (registrationsMap.has(name)) {
        // DEBUG: Log complete update flow for problem players
        if (DEBUG_FLAGS.NAME_MATCHING && (name.includes("Lucas Thomas") || name.includes("Vincent Picone") || name.includes("Lucas Caya"))) {
          const reg = registrationsMap.get(name);
          const excluded = isExcludedDiv(reg.div);
          const newBirth = excluded ? "" : reg.birth;
          const newDraft = excluded ? "" : shortenDiv(reg.div);
          const hadBirthAndDraft = row[statsMap["player birth date"]] && row[statsMap["draft"]];
          const hasChanges = String(row[statsMap["player birth date"]]) !== String(newBirth) || String(row[statsMap["draft"]]) !== String(newDraft);
          
          logDebug("Name Matching", "UPDATE_FLOW", {
            playerName: name,
            fromReg: { birth: reg.birth, div: reg.div, spec: reg.spec },
            isExcluded: excluded,
            calculated: { newBirth: newBirth, newDraft: newDraft },
            currentInDraft: { birth: row[statsMap["player birth date"]], draft: row[statsMap["draft"]] },
            stringCompare: { 
              birth: `'${String(row[statsMap["player birth date"]])}' vs '${String(newBirth)}'`,
              draft: `'${String(row[statsMap["draft"]])}' vs '${String(newDraft)}'`
            },
            hadBirthAndDraft: hadBirthAndDraft,
            hasChanges: hasChanges,
            willBeUpdated: hasChanges,
            category: hadBirthAndDraft ? "Already Updated" : "Updated"
          });
        }
        const reg = registrationsMap.get(name);
        const excluded = isExcludedDiv(reg.div);

        const newBirth = excluded ? "" : reg.birth;
        const newDraft = excluded ? "" : shortenDiv(reg.div);
        const newSpec = reg.spec || "";
        const team = challengeMap.get(name);
        const newChal =
          team && team !== "Unallocated" ? team : row[statsMap["challenge"]];

        // Check if Birth Date AND Draft were already populated ("Already Updated")
        const hadBirthAndDraft = 
          row[statsMap["player birth date"]] && row[statsMap["draft"]];

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
          
          // Categorize: Already Updated vs newly Updated
          if (hadBirthAndDraft) {
            uniqueAlreadyUpdated.add(name);
          } else {
            uniqueUpdated.add(name);
          }
        } else if (hadBirthAndDraft) {
          // No changes but data was already complete
          uniqueAlreadyUpdated.add(name);
        }
      } else {
        // Player not in Registrations - clear their data
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
      // DEBUG: Log ADD flow for problem players
      if (DEBUG_FLAGS.NAME_MATCHING && (name.includes("Lucas Thomas") || name.includes("Vincent Picone") || name.includes("Lucas Caya"))) {
        logDebug("Name Matching", "ADD_FLOW", {
          playerName: name,
          existsInDraftStats: existingPlayersInDraftStats.has(name),
          isExcluded: isExcludedDiv(reg.div),
          willBeAdded: !existingPlayersInDraftStats.has(name) && !isExcludedDiv(reg.div),
          regData: { birth: reg.birth, div: reg.div, spec: reg.spec }
        });
      }
      
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

    // 7) VERIFICATION CHECK: Calculate NOT Updated players
    // Re-read Draft_Stats to get the post-update state
    const verifyRange = statsSheet.getRange(
      2,
      1,
      Math.max(statsSheet.getLastRow() - 1, 1),
      statsSheet.getLastColumn(),
    );
    const verifyValues = verifyRange.getValues();
    const playersNotUpdated = new Set();

    registrationsMap.forEach((reg, regName) => {
      if (isExcludedDiv(reg.div)) return; // Skip excluded divisions
      
      let foundAndUpdated = false;
      verifyValues.forEach((row) => {
        const draftName =
          `${row[statsMap["player first name"]]} ${row[statsMap["player last name"]]}`.trim();
        if (draftName === regName) {
          // Check if this player has Birth Date AND Draft populated
          const hasBirth = row[statsMap["player birth date"]];
          const hasDraft = row[statsMap["draft"]];
          if (hasBirth && hasDraft) {
            foundAndUpdated = true;
          }
        }
      });
      
      if (!foundAndUpdated) {
        playersNotUpdated.add(regName);
      }
    });

    // 8) Calculate totals and verify accounting
    // Count only non-excluded division players for "Total Registered"
    let totalDraftEligiblePlayers = 0;
    let totalExcludedPlayers = 0;
    registrationsMap.forEach((reg, name) => {
      if (isExcludedDiv(reg.div)) {
        totalExcludedPlayers++;
      } else {
        totalDraftEligiblePlayers++;
      }
    });

    const summaryData =
      `Total Registered Players (draft-eligible): (${totalDraftEligiblePlayers}) --- ` +
      `Excluded (non-draft divisions): (${totalExcludedPlayers}) --- ` +
      `Already Updated (existing): (${uniqueAlreadyUpdated.size}) --- ` +
      `Updated (existing): (${uniqueUpdated.size}) --- ` +
      `Cleared (unregistered): (${uniqueCleared.size}) --- ` +
      `Added (new): (${newPlayerCount}) --- ` +
      `NOT Updated: (${playersNotUpdated.size})`;

    logSheet.appendRow([new Date(), "Script", "✅ Success", summaryData]);

    // 9) Build user-friendly popup message
    const popupRows = [
      ["Total Registered Players (draft-eligible):", totalDraftEligiblePlayers],
      ["Players Already Updated (existing players):", uniqueAlreadyUpdated.size],
      ["Players Updated (existing players):", uniqueUpdated.size],
      ["Players Cleared (unregistered):", uniqueCleared.size],
      ["Players Added (new players):", newPlayerCount],
      ["Players NOT Updated:", playersNotUpdated.size],
      ["", ""], // Blank line for separation
      ["Players in Excluded Divisions:", totalExcludedPlayers],
    ];
    const maxLabelLen = popupRows.reduce(
      (max, [label]) => Math.max(max, label.length),
      0,
    );
    const popupText = popupRows
      .map(([label, value]) => label.padEnd(maxLabelLen + 2) + value)
      .join("\n");

    let alertMessage = popupText;
    if (playersNotUpdated.size > 0) {
      alertMessage +=
        "\n\n⚠️ WARNING: Some registered players were NOT updated.\n" +
        "This may be due to name mismatches (spelling, spacing, nicknames).\n" +
        "Use your Sanity Checker to identify these players.";
    }
    
    // Add accounting verification note
    const accountedFor = uniqueAlreadyUpdated.size + uniqueUpdated.size + newPlayerCount + playersNotUpdated.size;
    if (accountedFor !== totalDraftEligiblePlayers) {
      alertMessage +=
        `\n\n⚠️ ACCOUNTING NOTE: Draft-eligible players (${totalDraftEligiblePlayers}) = ` +
        `Already Updated (${uniqueAlreadyUpdated.size}) + Updated (${uniqueUpdated.size}) + ` +
        `Added (${newPlayerCount}) + NOT Updated (${playersNotUpdated.size}) = ${accountedFor}`;
    }

    SpreadsheetApp.getUi().alert(alertMessage);
  } catch (e) {
    logSheet.appendRow([new Date(), "Script", "❌ Failed", e.message]);
    SpreadsheetApp.getUi().alert("❌ Sync Error\n\n" + e.message);
  }
}

// ============================================================================
// SANITY CHECKER - BI-DIRECTIONAL VALIDATION
// ============================================================================

/**
 * Runs bi-directional validation between Registration and Draft_Stats.
 * Identifies orphaned records and missing players, generates timestamped report.
 *
 * Check 1: Registration → Draft_Stats (Forward)
 *   - Finds draft-eligible players in Registration NOT in Draft_Stats
 *   - Should be 0 after successful sync (indicates name mismatch issues)
 *
 * Check 2: Draft_Stats → Registration (Reverse)
 *   - Finds players with Birth Date AND Draft in Draft_Stats NOT in current Registration
 *   - Flags orphaned records from previous seasons or manual entries
 */
function runSanityChecker() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const statsSheet = ss.getSheetByName("Draft_Stats");
  const regSheet = ss.getSheetByName("Registrations");

  if (!statsSheet || !regSheet) {
    ui.alert("❌ Error", "Required sheets (Draft_Stats or Registrations) are missing.", ui.ButtonSet.OK);
    return;
  }

  // Build header maps
  const statsHeaders = statsSheet.getRange(1, 1, 1, statsSheet.getLastColumn()).getValues()[0];
  const regHeaders = regSheet.getRange(6, 1, 1, regSheet.getLastColumn()).getValues()[0];
  const statsMap = getMap(statsHeaders);
  const regMap = getMap(regHeaders);

  // Build Registration lookup map (draft-eligible only)
  const registrationsMap = new Map();
  const regData = regSheet.getRange(7, 1, Math.max(regSheet.getLastRow() - 6, 1), regSheet.getLastColumn()).getValues();
  
  regData.forEach((row) => {
    const firstName = row[regMap["player first name"]];
    const lastName = row[regMap["player last name"]];
    const name = `${firstName} ${lastName}`.trim();
    const div = row[regMap["division name"]];
    
    if (name && name !== "undefined undefined" && !isExcludedDiv(div)) {
      const newReg = {
        birth: row[regMap["player birth date"]],
        div: div,
        spec: row[regMap["special player request"]],
      };
      
      // Use same duplicate handling logic as main sync
      if (registrationsMap.has(name)) {
        const existingReg = registrationsMap.get(name);
        const existingIsExcluded = isExcludedDiv(existingReg.div);
        const newIsExcluded = isExcludedDiv(newReg.div);
        if (newIsExcluded && !existingIsExcluded) {
          return; // Keep existing draft-eligible registration
        }
      }
      registrationsMap.set(name, newReg);
    }
  });

  // Build Draft_Stats lookup map (players with Birth Date AND Draft populated)
  const draftStatsMap = new Map();
  const statsData = statsSheet.getRange(2, 1, Math.max(statsSheet.getLastRow() - 1, 1), statsSheet.getLastColumn()).getValues();
  
  statsData.forEach((row) => {
    const firstName = row[statsMap["player first name"]];
    const lastName = row[statsMap["player last name"]];
    const name = `${firstName} ${lastName}`.trim();
    const birth = row[statsMap["player birth date"]];
    const draft = row[statsMap["draft"]];
    
    if (name && name !== "undefined undefined" && birth && draft) {
      draftStatsMap.set(name, {
        birth: birth,
        draft: draft,
        spec: row[statsMap["special player requests"]],
      });
    }
  });

  // CHECK 1: Registration → Draft_Stats (Forward)
  // Find draft-eligible players in Registration NOT in Draft_Stats
  const missingFromDraftStats = [];
  registrationsMap.forEach((reg, name) => {
    if (!draftStatsMap.has(name)) {
      missingFromDraftStats.push({
        issueType: "Missing from Draft_Stats",
        sourceName: name,
        birthDate: reg.birth,
        division: reg.div,
        specialRequest: reg.spec,
        action: "Possible name mismatch - check spelling",
      });
    }
  });

  // CHECK 2: Draft_Stats → Registration (Reverse)
  // Find players with Birth Date AND Draft in Draft_Stats NOT in current Registration
  const orphanedInDraftStats = [];
  draftStatsMap.forEach((draft, name) => {
    if (!registrationsMap.has(name)) {
      orphanedInDraftStats.push({
        issueType: "Orphaned in Draft_Stats",
        sourceName: name,
        birthDate: draft.birth,
        division: draft.draft,
        specialRequest: draft.spec,
        action: "Not in current registration - verify or remove",
      });
    }
  });

  // Generate report sheet
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
  const reportSheetName = `Sanity_Check_Results`;
  
  // Delete existing report sheet if it exists
  let reportSheet = ss.getSheetByName(reportSheetName);
  if (reportSheet) {
    ss.deleteSheet(reportSheet);
  }
  reportSheet = ss.insertSheet(reportSheetName);

  // Set up headers
  const headers = ["Issue Type", "Player Name", "Birth Date", "Division", "Special Request", "Recommended Action"];
  reportSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  reportSheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#2c5aa0")
    .setFontColor("#ffffff");

  // Add timestamp and summary
  reportSheet.getRange("A2").setValue(`Report Generated: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM dd, yyyy HH:mm:ss")}`);
  reportSheet.getRange("A3").setValue(`Total Draft-Eligible in Registration: ${registrationsMap.size}`);
  reportSheet.getRange("A4").setValue(`Total Populated in Draft_Stats: ${draftStatsMap.size}`);
  reportSheet.getRange("A5").setValue(`Issues Found: ${missingFromDraftStats.length + orphanedInDraftStats.length}`);
  
  // Format summary section
  reportSheet.getRange("A2:A5").setFontWeight("bold").setBackground("#f3f3f3");

  let currentRow = 7;

  // Add Check 1 results
  if (missingFromDraftStats.length > 0) {
    reportSheet.getRange(currentRow, 1).setValue(`🔴 CHECK 1: Missing from Draft_Stats (${missingFromDraftStats.length})`);
    reportSheet.getRange(currentRow, 1, 1, headers.length).mergeAcross().setBackground("#ea9999").setFontWeight("bold");
    currentRow++;
    
    missingFromDraftStats.forEach((issue) => {
      reportSheet.getRange(currentRow, 1, 1, 6).setValues([[
        issue.issueType,
        issue.sourceName,
        issue.birthDate,
        issue.division,
        issue.specialRequest || "",
        issue.action,
      ]]);
      reportSheet.getRange(currentRow, 1, 1, headers.length).setBackground("#f4c7c3");
      currentRow++;
    });
    currentRow++;
  } else {
    reportSheet.getRange(currentRow, 1).setValue(`✅ CHECK 1: All draft-eligible players found in Draft_Stats`);
    reportSheet.getRange(currentRow, 1, 1, headers.length).mergeAcross().setBackground("#d9ead3").setFontWeight("bold");
    currentRow += 2;
  }

  // Add Check 2 results
  if (orphanedInDraftStats.length > 0) {
    reportSheet.getRange(currentRow, 1).setValue(`🟡 CHECK 2: Orphaned in Draft_Stats (${orphanedInDraftStats.length})`);
    reportSheet.getRange(currentRow, 1, 1, headers.length).mergeAcross().setBackground("#ffd966").setFontWeight("bold");
    currentRow++;
    
    orphanedInDraftStats.forEach((issue) => {
      reportSheet.getRange(currentRow, 1, 1, 6).setValues([[
        issue.issueType,
        issue.sourceName,
        issue.birthDate,
        issue.division,
        issue.specialRequest || "",
        issue.action,
      ]]);
      reportSheet.getRange(currentRow, 1, 1, headers.length).setBackground("#fff2cc");
      currentRow++;
    });
  } else {
    reportSheet.getRange(currentRow, 1).setValue(`✅ CHECK 2: No orphaned records in Draft_Stats`);
    reportSheet.getRange(currentRow, 1, 1, headers.length).mergeAcross().setBackground("#d9ead3").setFontWeight("bold");
  }

  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    reportSheet.autoResizeColumn(i);
  }

  // Log to Automation Log
  let logSheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
  }
  
  const logMessage = 
    `Sanity Checker --- ` +
    `Draft-eligible in Reg: (${registrationsMap.size}) --- ` +
    `Populated in Draft_Stats: (${draftStatsMap.size}) --- ` +
    `Missing from Draft_Stats: (${missingFromDraftStats.length}) --- ` +
    `Orphaned in Draft_Stats: (${orphanedInDraftStats.length})`;
  
  logSheet.appendRow([new Date(), "Sanity Checker", "✅ Success", logMessage]);

  // Show summary alert
  const totalIssues = missingFromDraftStats.length + orphanedInDraftStats.length;
  let alertMsg = `Sanity Check Complete\n\n`;
  alertMsg += `Draft-Eligible in Registration: ${registrationsMap.size}\n`;
  alertMsg += `Populated in Draft_Stats: ${draftStatsMap.size}\n\n`;
  
  if (totalIssues === 0) {
    alertMsg += `✅ No issues found! All players accounted for.`;
  } else {
    alertMsg += `⚠️ Issues Found: ${totalIssues}\n`;
    if (missingFromDraftStats.length > 0) {
      alertMsg += `  🔴 Missing from Draft_Stats: ${missingFromDraftStats.length}\n`;
    }
    if (orphanedInDraftStats.length > 0) {
      alertMsg += `  🟡 Orphaned in Draft_Stats: ${orphanedInDraftStats.length}\n`;
    }
    alertMsg += `\nSee "${reportSheetName}" sheet for details.`;
  }
  
  ui.alert("Sanity Checker", alertMsg, ui.ButtonSet.OK);
  
  // Switch to report sheet
  ss.setActiveSheet(reportSheet);
}

// =================================================================================
// AI TOOLS (Negative Coaching Request Assistant, Scout Assistant, Draft Insights)
// =================================================================================


// =================================================================================
// AI TOOLS: Negative Coaching Request Assistant
// =================================================================================
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
    `Agent: (Negative Coach Assistant) --- Model: (gemini-2.5-flash-lite) --- ` +
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
 * Ask AI Scouting Assistant - accepts open-ended prompts for draft analysis.
 * Users can ask any question about their draft board and get AI-powered insights.
 */
function askGeminiAdHoc() {
  showAiScoutInputDialog();
}

/**
 * Processes the user's scouting question after input dialog submission.
 * Called by the custom HTML input dialog.
 */
function processScoutingQuestion(userPrompt) {
  const ui = SpreadsheetApp.getUi();
  
  if (!userPrompt) {
    ui.alert("Please enter a question for the AI Scouting Assistant.");
    return;
  }
  
  try {
    // Gather draft board data using helper
    const draftContext = getDraftBoardContext(50, true);
    
    // Build comprehensive prompt with scout persona
    const fullPrompt = 
      `You are an experienced youth baseball scout with deep knowledge of player development and draft strategy. ` +
      `When analyzing players, you think holistically about their overall value - considering batting, pitching, fielding, ` +
      `age/maturity, and team fit rather than just isolated statistics.\n\n` +
      `DRAFT BOARD CONTEXT:\n${draftContext.formattedText}\n\n` +
      `SCOUT QUESTION:\n${userPrompt}\n\n` +
      `Provide a thoughtful, analytical response that considers multiple factors and gives actionable insights.`;
    
    // Show loading message
    ui.alert("AI Scouting Assistant", "Analyzing draft board... This may take a moment.", ui.ButtonSet.OK);
    
    const response = callGeminiScout(fullPrompt);
    
    // Log usage with standardized format
    const queryPreview = userPrompt.length > 50 ? userPrompt.slice(0, 50) + "..." : userPrompt;
    logAiActivity(
      "Ask AI Scouting Assistant",
      "gemini-2.5-flash",
      `Query: (${queryPreview}) --- Players analyzed: (${Math.min(draftContext.playerCount, 50)})`
    );
    
    showAiScoutDialog("AI Scouting Assistant Response", response, userPrompt);
    
  } catch (e) {
    handleAiError(e, "Ask AI Scouting Assistant");
  }
}

/**
 * Analyzes the top portion of the draft board and returns an
 * executive-style summary of talent trends using Gemini.
 */
function aiDraftSummary() {
  try {
    // Gather draft board data using helper
    const draftContext = getDraftBoardContext(50, false);
    
    const prompt = `Analyze this draft board and provide a high-level executive summary including top talent trends.\n\nDATA:\n${JSON.stringify(draftContext.data)}`;
    const response = callGemini(prompt);
    
    // Log usage with standardized format
    logAiActivity(
      "Draft Insights",
      "gemini-2.5-flash-lite",
      `Players analyzed: (${draftContext.playerCount}) --- Summary generated`
    );

    showAiDialog("AI Draft Insights & Executive Summary", response);
    
  } catch (e) {
    handleAiError(e, "Draft Insights");
  }
}

/**
 * Gemini caller for batched negative coach request analysis.
 * Uses JSON mode to return a mapping of row index → label.
 *
 * @param {{index:number,text:string}[]} items - Array of requests with row indices.
 * @return {Object<number,string>} Map of index -> FLAG_STRONG | FLAG_POSSIBLE | SAFE.
 */
function callGeminiForRequestBatch(items) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;
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

  if (DEBUG_FLAGS.NEGATIVE_COACH) {
    logDebug("Negative Coach", "BATCH_RESPONSE", {
      statusCode,
      itemsCount: items.length,
      bodySnippet: bodyText.slice(0, 500),
    });
  }

  const outer = JSON.parse(bodyText);
  const rawText = outer.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    // Fall back: mark all as SAFE to avoid noisy false positives
    if (DEBUG_FLAGS.NEGATIVE_COACH) {
      logDebug("Negative Coach", "NO_RAWTEXT", {
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
    if (DEBUG_FLAGS.NEGATIVE_COACH) {
      logDebug("Negative Coach", "PARSED_LABELS", {
        labels: parsed,
        sampleRequests: items.slice(0, 5),
      });
    }
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    if (DEBUG_FLAGS.NEGATIVE_COACH) {
      logDebug("Negative Coach", "PARSE_ERROR", {
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
 * Calls Gemini Flash (full model) for complex scouting analysis.
 * Uses higher token limit and reasoning capability than Lite version.
 *
 * @param {string} prompt - The prompt text to send to Gemini.
 * @return {string} Generated text or a fallback message.
 */
function callGeminiScout(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [
        {
          text: "You are an experienced youth baseball scout who analyzes players holistically, " +
                "considering batting, pitching, fielding, age, maturity, and team dynamics. " +
                "You provide actionable insights and think strategically about draft picks."
        },
      ],
    },
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.7,
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
    json.candidates?.[0]?.content?.parts?.[0]?.text || "Scout unavailable - please try again."
  );
}

/**
 * Displays a custom input dialog for asking scouting questions.
 * Larger and more user-friendly than the default ui.prompt().
 */
function showAiScoutInputDialog() {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 20px;
          background-color: #f9f9f9;
          margin: 0;
        }
        .header {
          background-color: #2c5aa0;
          color: white;
          padding: 12px 16px;
          margin: -20px -20px 20px -20px;
          border-radius: 4px 4px 0 0;
        }
        .header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        .example-box {
          background-color: #e8f0fe;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 20px;
          border-left: 4px solid #2c5aa0;
          font-size: 13px;
        }
        .example-box strong {
          color: #1a73e8;
        }
        textarea {
          width: 100%;
          height: 200px;
          padding: 12px;
          border: 2px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          resize: vertical;
          box-sizing: border-box;
        }
        textarea:focus {
          outline: none;
          border-color: #2c5aa0;
        }
        .button-container {
          margin-top: 16px;
          text-align: right;
        }
        button {
          padding: 10px 20px;
          font-size: 14px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-left: 8px;
        }
        .btn-submit {
          background-color: #2c5aa0;
          color: white;
        }
        .btn-submit:hover {
          background-color: #1a4d8f;
        }
        .btn-cancel {
          background-color: #e0e0e0;
          color: #333;
        }
        .btn-cancel:hover {
          background-color: #d0d0d0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h3>Ask AI Scouting Assistant</h3>
      </div>
      
      <div class="example-box">
        <strong>Example Questions:</strong><br>
        • "If our league prioritizes strong bats who can pitch, give me a list of the top 10 probable picks"<br>
        • "Which players would be the best team captains based on their stats and maturity?"<br>
        • "Compare the top 5 pitchers and recommend draft order"
      </div>
      
      <label for="question" style="font-weight: 600; font-size: 14px; display: block; margin-bottom: 8px;">
        Your Scouting Question:
      </label>
      <textarea id="question" placeholder="Enter your question here..."></textarea>
      
      <div class="button-container">
        <button class="btn-cancel" onclick="google.script.host.close()">Cancel</button>
        <button class="btn-submit" onclick="submitQuestion()">Submit Question</button>
      </div>
      
      <script>
        function submitQuestion() {
          const question = document.getElementById('question').value.trim();
          if (!question) {
            alert('Please enter a question.');
            return;
          }
          google.script.run
            .withSuccessHandler(function() {
              google.script.host.close();
            })
            .processScoutingQuestion(question);
        }
        
        // Allow Enter key to submit (with Shift+Enter for new lines)
        document.getElementById('question').addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitQuestion();
          }
        });
        
        // Auto-focus the textarea
        document.getElementById('question').focus();
      </script>
    </body>
    </html>
  `;
  
  const output = HtmlService.createHtmlOutput(html)
    .setWidth(700)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(output, 'AI Scouting Assistant');
}

/**
 * Displays AI scouting output in a large, user-friendly modal dialog.
 *
 * @param {string} title   - Dialog title.
 * @param {string} content - AI response text to display.
 * @param {string} userQuery - Original user question.
 */
function showAiScoutDialog(title, content, userQuery) {
  // Debug logging - check if new dimensions are being used
  if (DEBUG_FLAGS.SCOUTING_ASSISTANT) {
    logDebug("Scouting Assistant", "DIALOG_DIMENSIONS", {
      width: 1000,
      height: 900,
      contentHeight: 600,
      timestamp: new Date().toISOString()
    });
  }
  
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: #2c5aa0; color: white; padding: 12px 16px; margin: -20px -20px 20px -20px; border-radius: 4px 4px 0 0;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Your Question</h3>
      </div>
      <div style="background-color: #e8f0fe; padding: 12px; border-radius: 4px; margin-bottom: 20px; border-left: 4px solid #2c5aa0;">
        <p style="margin: 0; font-size: 13px; color: #333; font-style: italic;">"${userQuery}"</p>
      </div>
      
      <div style="background-color: #2c5aa0; color: white; padding: 12px 16px; margin: 0 -20px 20px -20px;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">AI Scout Analysis</h3>
      </div>
      <div style="background-color: white; padding: 16px; border-radius: 4px; border: 1px solid #ddd; height: 600px; overflow-y: scroll; overflow-x: hidden;">
        <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.7; color: #333;">${content}</div>
      </div>
      
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #666; text-align: center;">
        Powered by Gemini 2.5 Flash • Results are AI-generated suggestions • v2.0 (1000x900)
      </div>
    </div>
  `;
  
  const output = HtmlService.createHtmlOutput(html)
    .setWidth(1000)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(output, title);
}

/**
 * Calls the Gemini model and returns the first text candidate, with
 * basic retry and a safe fallback.
 *
 * @param {string} prompt - The prompt text to send to Gemini.
 * @return {string} Generated text or a fallback message.
 */
function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;
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
// AI SHARED UTILITIES
// ============================================================================

/**
 * Logs AI tool activity to the Automation Log sheet with standardized format.
 * 
 * @param {string} agentName - Name of the AI agent (e.g., "Negative Coach Assistant")
 * @param {string} modelName - Gemini model used (e.g., "gemini-2.5-flash-lite")
 * @param {string} details - Tool-specific details (e.g., metrics, results)
 */
function logAiActivity(agentName, modelName, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
  }
  
  const logMessage = `Agent: (${agentName}) --- Model: (${modelName}) --- ${details}`;
  logSheet.appendRow([new Date(), "AI", "✅ Success", logMessage]);
}

/**
 * Gathers draft board data for AI analysis.
 * Extracts player data from Draft_Stats sheet and optionally formats it.
 * 
 * @param {number} maxPlayers - Maximum number of players to include in detailed format (default: 50)
 * @param {boolean} includeDetailedFormat - Whether to return formatted text for AI (default: true)
 * @return {Object} Object containing headers, data, formattedText (if requested), and playerCount
 */
function getDraftBoardContext(maxPlayers = 50, includeDetailedFormat = true) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Draft_Stats");
  
  if (!sheet) {
    throw new Error("Draft_Stats sheet is missing.");
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error("No player data found in Draft_Stats.");
  }
  
  const dataRows = Math.min(lastRow, 200);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, dataRows - 1, sheet.getLastColumn()).getValues();
  
  if (includeDetailedFormat) {
    let playerData = "DRAFT BOARD DATA:\n" + "=".repeat(80) + "\n\n";
    
    data.forEach((row, idx) => {
      if (idx >= maxPlayers) return;
      
      playerData += `Player ${idx + 1}:\n`;
      headers.forEach((header, i) => {
        if (row[i]) {
          playerData += `  ${header}: ${row[i]}\n`;
        }
      });
      playerData += "\n";
    });
    
    if (dataRows > maxPlayers) {
      playerData += `\n(${dataRows - maxPlayers} additional players available in the draft board)\n`;
    }
    
    return { headers, data, formattedText: playerData, playerCount: dataRows - 1 };
  }
  
  return { headers, data, playerCount: dataRows - 1 };
}

/**
 * Handles AI tool errors with consistent logging and user alerts.
 * 
 * @param {Error} error - The error object that was caught
 * @param {string} toolName - Name of the AI tool that encountered the error
 */
function handleAiError(error, toolName) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Timestamp", "Source", "Status", "Comments"]);
    logSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
  }
  
  const errorMsg = `Agent: (${toolName}) --- Error: ${error.message}`;
  logSheet.appendRow([new Date(), "AI", "❌ Failed", errorMsg]);
  
  ui.alert(
    `${toolName} Error`,
    `Failed to complete analysis:\n\n${error.message}`,
    ui.ButtonSet.OK
  );
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
 * Unified debug logging helper - logs debug info to a single "Debug_Log" sheet.
 * All features use this shared infrastructure.
 * 
 * @param {string} feature - Feature name (e.g., "Negative Coach", "Scouting Assistant")
 * @param {string} event - Event description (e.g., "BATCH_RESPONSE", "API_CALL")
 * @param {Object} payload - Data to log (will be JSON stringified)
 */
function logDebug(feature, event, payload) {
  try {
    // Also send to Apps Script log for quick console inspection
    try {
      Logger.log(
        "[%s] %s :: %s",
        feature,
        event,
        JSON.stringify(payload).slice(0, 1000),
      );
    } catch (logErr) {
      // Ignore logging errors
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = "Debug_Log";
    let sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

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
