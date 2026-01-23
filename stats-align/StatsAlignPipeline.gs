/**
 * PROJECT OVERVIEW: Stats Alignment Pipeline (Staging → Raw_Stats)
 * @OnlyCurrentDoc
 * ==============================================================================
 * AI-powered CSV stat file normalization for league-wide data with varied
 * naming conventions. Uses Gemini 2.5 to intelligently map inconsistent
 * headers to standardized master columns.
 *
 * CURRENT VERSION: 2.0
 * +-------------------------------------------------------------------------------+
 * |                            CHANGE LOG                                         |
 * +---------+-------------+-------------------------------------------------------+
 * | VERSION | DATE        | DESCRIPTION                                           |
 * +---------+-------------+-------------------------------------------------------+
 * | 2.0     | 2026-01-11  | AI mapping for league stats with varied naming        |
 * | 1.0     | 2026-01-11  | Initial release: Direct mapping pipeline (no AI)      |
 * +---------+-------------+-------------------------------------------------------+
 *
 * +-------------------------------------------------------------------------------+
 * |                            FEATURES                                           |
 * +-------------------------------------------------------------------------------+
 * | [GenAI]  Gemini 2.5 Header Mapping: Intelligent stat name matching            |
 * | [GenAI]  Context-Aware Section Detection: Batting/Pitching/Fielding           |
 * | [Core]   JSON Mode API: Structured AI responses for reliability               |
 * | [Core]   2-Row Header Support: Handles section + stat name headers            |
 * | [Core]   Identity Detection: Jersey #, First Name, Last Name via AI           |
 * | [Core]   Data Cleaning: Filters Totals, Team, Glossary rows                   |
 * | [Core]   Visual Audit Logs: Two-row reconciliation showing source→master      |
 * | [Core]   Extra Stat Detection: Identifies unmapped source columns             |
 * | [Core]   ScriptLock: Prevents concurrent runs on large imports                |
 * +-------------------------------------------------------------------------------+
 *
 * +-------------------------------------------------------------------------------+
 * |                         PROCESS FLOW                                          |
 * +-------------------------------------------------------------------------------+
 * | 1. Paste .csv data into "Staging" sheet                                       |
 * | 2. Extract 2-row headers and data from Staging                                |
 * | 3. Send staging headers to Gemini 2.5 for intelligent mapping                 | 
 * | 4. AI maps varied naming to standard master columns with context              |
 * | 5. Filter junk rows (Totals, Team, Glossary)                                  |
 * | 6. Align staging columns to master schema using AI mappings                   |
 * | 7. Log reconciliation details and append to Raw_Stats                         |
 * +-------------------------------------------------------------------------------+
 */

const CONFIG = {
  VERSION: "2.0",
  AI_MODEL: "gemini-2.5-flash-preview-09-2025"
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('GC Automation')
      .addItem('Align & Import Staging Data (AI)', 'aggregateAndAlignStats')
      .addSeparator()
      .addItem('View Automation Logs', 'openLogsSheet')
      .addToUi();
}

function aggregateAndAlignStats() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stagingSheet = ss.getSheetByName("Staging");
  const rawStatsSheet = ss.getSheetByName("Raw_Stats");
  const logSheet = ss.getSheetByName("Automation_Logs") || ss.insertSheet("Automation_Logs");
  const tz = ss.getSpreadsheetTimeZone();

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { ui.alert("⚠️ System busy."); return; }

  try {
    if (stagingSheet.getLastRow() < 3) throw new Error("Staging sheet is empty.");
    
    // 1. DATA EXTRACTION
    const masterFullRange = rawStatsSheet.getRange(1, 1, 2, rawStatsSheet.getLastColumn()).getValues();
    const stagingHeaderRow1 = stagingSheet.getRange(1, 1, 1, stagingSheet.getLastColumn()).getValues()[0];
    const stagingHeaderRow2 = stagingSheet.getRange(2, 1, 1, stagingSheet.getLastColumn()).getValues()[0];
    const stagingData = stagingSheet.getDataRange().getValues().slice(2);

    // 2. PREP KEYS
    const masterKeys = createSectionHeaderArray(masterFullRange[0], masterFullRange[1]);
    const stagingKeys = createSectionHeaderArray(stagingHeaderRow1, stagingHeaderRow2);
    const masterColMap = {};
    masterKeys.forEach((key, idx) => { if (key) masterColMap[key] = idx; });

    // 3. AI MAPPING (Stable Single-Prompt Logic)
    const prompt = `Map baseball stats from INCOMING to MASTER. Return JSON only.
    MASTER: ${masterKeys.join(", ")}
    INCOMING: ${stagingKeys.join(", ")}
    RULES:
    1. Map "Number" or "#" to "General_Number".
    2. Map "First" to "General_First", "Last" to "General_Last".
    3. Use context: "AVG" in Batting -> "Batting_AVG".
    Format: {"Incoming_Key": "Master_Key"}`;

    const aiResponse = callGemini(prompt, true);
    const aiMap = JSON.parse(aiResponse);

    // 4. RECONCILIATION & AUDIT PREP
    let totalProcessableStats = 0, statsAligned = 0, statsExtra = 0, statsMissing = 0;
    let listExtra = [], listMissing = [];
    let visualAuditRow = new Array(masterFullRange[1].length).fill(""); 

    stagingKeys.forEach((sKey, idx) => {
      const hText = stagingHeaderRow2[idx];
      if (hText && !hText.toLowerCase().includes("rank")) {
        totalProcessableStats++;
        const targetMasterKey = aiMap[sKey];
        if (targetMasterKey && masterColMap[targetMasterKey] !== undefined) {
          statsAligned++;
          visualAuditRow[masterColMap[targetMasterKey]] = hText;
        } else {
          statsExtra++;
          listExtra.push(`[EXTRA] ${hText}`);
        }
      }
    });

    Object.keys(masterColMap).forEach(mKey => {
      if (!Object.values(aiMap).includes(mKey)) {
        statsMissing++;
        listMissing.push(mKey);
      }
    });

    // 5. ROW PROCESSING
    let alignedData = [];
    let playerLogNames = [];
    stagingData.forEach((row) => {
      const colA = (row[0] || "").toString().toLowerCase();
      const colB = (row[1] || "").toString().toLowerCase();
      const isJunk = (v) => v.includes("total") || v.includes("team") || v.includes("glossary");
      if ((!colA && !colB) || isJunk(colA) || isJunk(colB)) return;

      let newRow = new Array(masterFullRange[1].length).fill("");
      let matchedInRow = 0;
      let pLast = "Unknown", pNum = "?";

      row.forEach((cellValue, colIdx) => {
        let targetKey = aiMap[stagingKeys[colIdx]];
        if (targetKey && masterColMap[targetKey] !== undefined) {
          newRow[masterColMap[targetKey]] = cellValue;
          matchedInRow++;
          if (targetKey === "General_Last") pLast = cellValue;
          if (targetKey === "General_Number") pNum = cellValue;
        }
      });
      if (matchedInRow > 0) {
        alignedData.push(newRow);
        playerLogNames.push(`${pNum} ${pLast}`); 
      }
    });

    if (alignedData.length === 0) throw new Error("No player data aligned by AI.");

    // 6. LOGGING & INJECTION
    const timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss z");
    const playerRangeMsg = `Imported ${playerLogNames.length} players between ${playerLogNames[0]} and ${playerLogNames[playerLogNames.length-1]}`;
    const reconMsg = `${totalProcessableStats} total stats, ${statsAligned} stats aligned, ${statsMissing} stats missing, ${statsExtra} stats extra`;

    logSheet.appendRow([timestamp, "✅ SUCCESS (v" + CONFIG.VERSION + ")", playerRangeMsg, "Raw Stats ->", ...masterFullRange[1]]);
    
    let lastFilledIdx = -1;
    for (let i = visualAuditRow.length - 1; i >= 0; i--) {
      if (visualAuditRow[i] !== "") { lastFilledIdx = i; break; }
    }
    const trimmedAuditRow = (lastFilledIdx === -1) ? [] : visualAuditRow.slice(0, lastFilledIdx + 1);
    logSheet.appendRow(["", "", reconMsg, "Staging ->"].concat(trimmedAuditRow).concat(listExtra));
    
    logSheet.getRange(logSheet.getLastRow(), 1, 1, logSheet.getLastColumn()).setBorder(null, null, true, null, null, null, "#444444", SpreadsheetApp.BorderStyle.SOLID);

    rawStatsSheet.getRange(rawStatsSheet.getLastRow() + 1, 1, alignedData.length, masterFullRange[1].length)
                .setValues(alignedData).setBackground("#fff2cc");

    ui.alert('Import Successful', `${playerRangeMsg}\n\n${reconMsg}`, ui.ButtonSet.OK);

  } catch (err) { ui.alert("⚠️ Error: " + err.message); } finally { lock.releaseLock(); }
}

function callGemini(prompt, isJson = false) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.AI_MODEL}:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  if (isJson) payload.generationConfig = { responseMimeType: "application/json" };
  const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
  const resp = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(resp.getContentText());
  if (json.error) throw new Error("API Error: " + json.error.message);
  return json.candidates[0].content.parts[0].text;
}

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

function openLogsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName("Automation_Logs");
  if (s) s.activate();
}
*/