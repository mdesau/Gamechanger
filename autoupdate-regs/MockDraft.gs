/**
 * MOCK DRAFT TOOL
 * ==============================================================================
 * Provides the backend logic for the AI Mock Draft Tool.
 * Handlers for the HTML Modal Dialog and interaction with Gemini.
 */

/**
 * Opens the Mock Draft Wizard dialog.
 */
function showMockDraftDialog() {
  const html = HtmlService.createHtmlOutputFromFile('MockDraftDialog')
      .setWidth(450)
      .setHeight(600)
      .setTitle('AI Mock Draft Wizard');
  SpreadsheetApp.getUi().showModalDialog(html, 'AI Mock Draft Configuration');
}

/**
 * CLIENT-SIDE HANDLER: Fetches unique Seasons from the selected Division sheet.
 * @param {string} divisionSheetName - "IMP", "AMP", "Minors", or "Majors"
 * @return {string[]} Array of unique season strings (e.g. ["Spring 2025", "Fall 2025"])
 */
function getDivisionSeasons(divisionSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(divisionSheetName);
  if (!sheet) throw new Error(`Sheet "${divisionSheetName}" not found. Please ensure it exists.`);

  // Find "Season" column
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const seasonIdx = headers.findIndex(h => h.toString().toLowerCase().includes('season'));
  
  if (seasonIdx === -1) throw new Error('Column "Season" not found in row 1.');

  const data = sheet.getRange(2, seasonIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  const seasons = new Set();
  
  data.forEach(r => {
    if (r[0]) seasons.add(r[0].toString().trim());
  });

  return Array.from(seasons).sort();
}

/**
 * CLIENT-SIDE HANDLER: Fetches headers to use as potential Weighted Stats.
 * Excludes metadata columns like Name, Season, Team.
 */
function getDivisionStatColumns(divisionSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(divisionSheetName);
  if (!sheet) return [];

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const excluded = ['player', 'name', 'first', 'last', 'season', 'team', 'division', 'id', 'timestamp'];
  
  return headers.filter(h => {
    const lower = h.toString().toLowerCase();
    return !excluded.some(ex => lower.includes(ex));
  });
}

/**
 * MAIN EXECUTION: Runs the Mock Draft process.
 * 1. Reads data from Division sheet
 * 2. Filters by Season
 * 3. Builds Prompt
 * 4. Calls Gemini
 * 5. Creates Output Sheet
 */
function runMockDraft(config) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(config.division);
  if (!sheet) throw new Error("Sheet not found: " + config.division);

  // 1. READ & FILTER DATA
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  
  const seasonIdx = headers.findIndex(h => h.toString().toLowerCase().includes('season'));
  if (seasonIdx === -1) throw new Error('Season column missing');

  // Helper to find name columns
  const fNameIdx = headers.findIndex(h => h.toLowerCase().includes('first name'));
  const lNameIdx = headers.findIndex(h => h.toLowerCase().includes('last name') && !h.toLowerCase().includes('first'));
  
  // Filter for season
  const players = [];
  data.forEach(row => {
    if (row[seasonIdx] == config.season) {
      // Create a simplified object for the AI to save tokens
      // We map Name + Weighted Stats + a few basics
      let pObj = {};
      if (fNameIdx > -1 && lNameIdx > -1) {
        pObj.name = `${row[fNameIdx]} ${row[lNameIdx]}`;
      } else {
        // Fallback if typical GameChanger export format differs
        pObj.name = row[0]; 
      }
      
      // Add weighted stats
      config.weightedStats.forEach(statName => {
        const idx = headers.indexOf(statName);
        if (idx > -1) pObj[statName] = row[idx];
      });

      // Add a few generic likely stats if no weights provided (AVG, OBP, ERA)
      if (!config.weightedStats.length) {
         ['AVG', 'OBP', 'SLG', 'ERA', 'IP'].forEach(s => {
            const idx = headers.findIndex(h => h.includes(s));
            if (idx > -1) pObj[s] = row[idx];
         });
      }
      
      players.push(pObj);
    }
  });

  if (players.length < config.teams) {
    throw new Error(`Not enough players (${players.length}) for ${config.teams} teams.`);
  }

  // 2. BUILD PROMPT
  const prompt = `
ROLE: Meticulous baseball statistician and snake-draft manager.
TASK: Run a simulated snake draft for a youth baseball league.

STRATEGIC CONTEXT (YOUTH LEAGUE):
1. **Two-Way Players are King**: In this league, pitchers also hit. The highest value players are those who combine strong Pitching stats (if available) with strong Hitting stats (AVG, OPS).
2. **Catchers are Gold**: The 'INN' column explicitly represents Innings Caught (Catcher). Players with high 'INN' values are scarce and critical assets. Prioritize them early, especially if they can hit.
3. **Priority**: Pitching > Catching > Shortstop > General Field.

PARAMETERS:
- Total Teams: ${config.teams}
- Total Players: ${players.length}
- Methodology: 
  1. Calculate a 'Performance Score' for each player based on the Strategic Context above.
  2. USER WEIGHTING: Apply extra weight to these user-selected stats: [${config.weightedStats.join(', ')}].
  3. GUIDELINES: ${config.guidelines}
  4. Perform a snake draft (Team 1 -> Team ${config.teams}, then Team ${config.teams} -> Team 1).
  5. IMPORTANT: Assign EVERY provided player to a team. Do not leave anyone out.

INPUT DATA (JSON):
${JSON.stringify(players.slice(0, 200))} 
(Note: If list is truncated, draft as many as provided)

OUTPUT FORMAT:
Return strictly a JSON object with this structure:
{
  "teams": [
    {
      "name": "Team 1",
      "players": ["Name 1", "Name 2", ...] // In order of draft pick
    },
    ...
  ]
}
NO MARKDOWN. NO EXPLANATION. JUST JSON.
`;

  // 3. CALL GEMINI
  // Note: Using existing GeminiClient from parent script
  const client = new GeminiClient("gemini-2.5-flash", 0.4);
  const result = client.generateJson(prompt, { maxTokens: 4000 });

  // 4. WRITE TO SHEET
  const targetSheetName = `${config.division} Mock Draft`;
  let targetSheet = ss.getSheetByName(targetSheetName);
  if (targetSheet) {
    targetSheet.clear();
  } else {
    targetSheet = ss.insertSheet(targetSheetName);
  }

  // Setup Headers: Row 1 = Team Names
  if (!result.teams || result.teams.length === 0) throw new Error("AI returned no teams.");
  
  // Sort teams by numeric name if possible to ensure Team 1, Team 2 order
  result.teams.sort((a,b) => {
    const na = parseInt(a.name.replace(/\D/g,'')) || 0;
    const nb = parseInt(b.name.replace(/\D/g,'')) || 0;
    return na - nb;
  });

  const teamNames = result.teams.map(t => t.name);
  targetSheet.getRange(1, 2, 1, teamNames.length).setValues([teamNames])
    .setFontWeight('bold')
    .setBackground('#cfe2f3')
    .setHorizontalAlignment('center');
    
  targetSheet.getRange(1, 1).setValue("Round").setFontWeight('bold');

  // Fill Data
  // Determine max roster size
  const maxRoster = Math.max(...result.teams.map(t => t.players.length));
  const grid = [];
  
  for (let r = 0; r < maxRoster; r++) {
    const row = [r + 1]; // Round Number
    for (let t = 0; t < teamNames.length; t++) {
      const player = result.teams[t].players[r] || "";
      row.push(player);
    }
    grid.push(row);
  }

  targetSheet.getRange(2, 1, grid.length, grid[0].length).setValues(grid);
  
  // Format
  targetSheet.autoResizeColumns(1, grid[0].length);
  targetSheet.setFrozenRows(1);
  targetSheet.setFrozenColumns(1);
  
  // Log Success
  logAiActivity(
    "Mock Draft Tool",
    "gemini-2.5-flash",
    `Created ${targetSheetName} with ${result.teams.length} teams. Config: ${config.season}`
  );

  return true;
}
