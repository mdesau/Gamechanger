/**
 * PROJECT OVERVIEW: Stats Alignment Pipeline (Staging → Raw_Stats)
 * @OnlyCurrentDoc
 * ==============================================================================
 * Standardizes GameChanger CSV stat files into a consistent Raw_Stats table
 * using direct string mapping for reliable high-column count processing (180+).
 *
 * CURRENT VERSION: 1.0
 * +-----------------------------------------------------------------------------+
 * |                            CHANGE LOG                                       |
 * +---------+-------------+-------------------------------------------------------+
 * | VERSION | DATE        | DESCRIPTION                                           |
 * +---------+-------------+-------------------------------------------------------+
 * | 1.0     | 2026-01-11  | Initial release: Direct mapping pipeline (no AI)      |
 * +---------+-------------+-------------------------------------------------------+
 *
 * +-----------------------------------------------------------------------------+
 * |                            FEATURES                                         |
 * +-----------------------------------------------------------------------------+
 * | [Core]   Direct String Mapping: Exact header matching without AI           |
 * | [Core]   2-Row Header Support: Handles section + stat name headers         |
 * | [Core]   Identity Detection: Jersey #, First Name, Last Name hard-coded    |
 * | [Core]   Data Cleaning: Filters Totals, Team, Glossary rows                |
 * | [Core]   Visual Audit Logs: Two-row reconciliation showing source→master   |
 * | [Core]   Extra Stat Detection: Identifies unmapped source columns          |
 * | [Core]   ScriptLock: Prevents concurrent runs on large imports             |
 * +-----------------------------------------------------------------------------+
 *
 * +-----------------------------------------------------------------------------+
 * |                         PROCESS FLOW                                        |
 * +-----------------------------------------------------------------------------+
 * | 1. Paste .csv data into "Staging" sheet                                     |
 * | 2. Extract 2-row headers and data from Staging                              |
 * | 3. Map sections (Batting/Pitching/Fielding) and match to Raw_Stats headers  |
 * | 4. Filter junk rows (Totals, Team, Glossary)                                |
 * | 5. Align staging columns to master schema                                   |
 * | 6. Log reconciliation details and append to Raw_Stats                       |
 * +-----------------------------------------------------------------------------+
 */

const CONFIG = {
  VERSION: "1.0"
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('GC Automation')
      .addItem('Align & Import Staging Data', 'aggregateAndAlignStats')
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

    // 2. CREATE MASTER MAP (Section_Header)
    let masterColMap = {};
    let mSec = "General";
    masterFullRange[0].forEach((c, i) => {
      let v = (c || "").toString().toLowerCase();
      if (v.includes("batting") || v.includes("hitting")) mSec = "Batting";
      else if (v.includes("pitching")) mSec = "Pitching";
      else if (v.includes("fielding")) mSec = "Fielding";
      if (masterFullRange[1][i]) masterColMap[mSec + "_" + masterFullRange[1][i].toString().trim()] = i;
    });

    // 3. CREATE STAGING MAP (Direct Match Logic)
    let alignMap = {};
    let sSec = "General";
    let stagingKeys = [];

    stagingHeaderRow2.forEach((h, i) => {
      let v1 = (stagingHeaderRow1[i] || "").toString().toLowerCase();
      if (v1.includes("batting") || v1.includes("hitting")) sSec = "Batting";
      else if (v1.includes("pitching")) sSec = "Pitching";
      else if (v1.includes("fielding")) sSec = "Fielding";
      
      let headerText = (h || "").toString().trim();
      let sKey = sSec + "_" + headerText;
      stagingKeys.push(sKey);

      // Identity Direct Matches
      if (headerText === "#" || headerText.toLowerCase() === "number") alignMap[sKey] = "General_Number";
      else if (headerText.toLowerCase() === "first") alignMap[sKey] = "General_First";
      else if (headerText.toLowerCase() === "last") alignMap[sKey] = "General_Last";
      else if (masterColMap[sKey] !== undefined) alignMap[sKey] = sKey;
    });

    // 4. RECONCILIATION & AUDIT PREP
    let totalProcessableStats = 0, statsAligned = 0, statsExtra = 0, statsMissing = 0;
    let listExtra = [], listMissing = [];
    let visualAuditRow = new Array(masterFullRange[1].length).fill(""); 

    // STAGING RECON
    stagingHeaderRow2.forEach((h, idx) => {
      const hText = (h || "").toString().trim();
      if (hText && !hText.toLowerCase().includes("rank")) {
        totalProcessableStats++;
        const sKey = stagingKeys[idx];
        if (alignMap[sKey]) {
          statsAligned++;
          visualAuditRow[masterColMap[alignMap[sKey]]] = hText;
        } else {
          statsExtra++;
          listExtra.push(`[EXTRA] ${hText}`);
        }
      }
    });

    // MASTER RECON (Missing)
    const mappedTargets = Object.values(alignMap);
    Object.keys(masterColMap).forEach(mKey => {
      if (!mappedTargets.includes(mKey)) {
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
      const isJunk = (val) => val.includes("total") || val.includes("team") || val.includes("glossary");
      if ((!colA && !colB) || isJunk(colA) || isJunk(colB)) return;

      let newRow = new Array(masterFullRange[1].length).fill("");
      let matchedInRow = 0;
      let pLast = "Unknown", pNum = "?";
      row.forEach((cellValue, colIdx) => {
        let targetKey = alignMap[stagingKeys[colIdx]];
        if (targetKey && masterColMap[targetKey] !== undefined) {
          let targetIdx = masterColMap[targetKey];
          newRow[targetIdx] = cellValue;
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

    if (alignedData.length === 0) throw new Error("No player rows aligned.");

    // 6. LOGGING & INJECTION
    const timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss z");
    const playerRangeMsg = `Imported ${playerLogNames.length} players between ${playerLogNames[0]} and ${playerLogNames[playerLogNames.length - 1]}`;
    const reconMsg = `${totalProcessableStats} total stats, ${statsAligned} aligned, ${statsMissing} missing, ${statsExtra} extra`;

    logSheet.appendRow([timestamp, "✅ SUCCESS (v" + CONFIG.VERSION + ")", playerRangeMsg, "Raw Stats ->", ...masterFullRange[1]]);
    
    // VISUAL TRIM FOR LOG
    let lastFilledIdx = -1;
    for (let i = visualAuditRow.length - 1; i >= 0; i--) {
      if (visualAuditRow[i] !== "") { lastFilledIdx = i; break; }
    }
    const trimmedAuditRow = (lastFilledIdx === -1) ? [] : visualAuditRow.slice(0, lastFilledIdx + 1);

    const stagingLogRow = ["", "", reconMsg, "Staging ->"].concat(trimmedAuditRow).concat(listExtra);
    logSheet.appendRow(stagingLogRow);
    
    logSheet.getRange(logSheet.getLastRow(), 1, 1, logSheet.getLastColumn()).setBorder(null, null, true, null, null, null, "#444444", SpreadsheetApp.BorderStyle.SOLID);

    rawStatsSheet.getRange(rawStatsSheet.getLastRow() + 1, 1, alignedData.length, masterFullRange[1].length)
                .setValues(alignedData).setBackground("#fff2cc");

    ui.alert('Import Successful', `${playerRangeMsg}\n\n${reconMsg}`, ui.ButtonSet.OK);

  } catch (err) { ui.alert("⚠️ Error: " + err.message); } finally { lock.releaseLock(); }
}

function openLogsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName("Automation_Logs");
  if (s) s.activate();
}

*/
