require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = process.env.CLICKUP_LIST_ID;
const BASE_URL = "https://api.clickup.com/api/v2";

if (!API_TOKEN || !LIST_ID) {
  console.error("Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID in .env");
  process.exit(1);
}

async function clickupFetch(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: API_TOKEN },
  });
  if (!res.ok) {
    throw new Error(`[${res.status}] ${await res.text()}`);
  }
  return res.json();
}

// Matches: "Weekly 06/09/2026 <to> 10/09/2026" (DD/MM/YYYY)
const WEEKLY_NAME_RE =
  /Weekly\s+(\d{2})\/(\d{2})\/(\d{4})\s*<to>\s*(\d{2})\/(\d{2})\/(\d{4})/i;

function parseDate(dd, mm, yyyy) {
  // Local midnight, DD/MM/YYYY
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function todayLocalMidnight() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Fetches ALL tasks in the list (including nested subtasks),
 * finds the one named "Weekly X <to> Y" whose range contains today.
 */
async function findCurrentWeeklyTask() {
  // include_closed + subtasks so we reach nested "Weekly ..." tasks
  const data = await clickupFetch(
    `/list/${LIST_ID}/task?subtasks=true&include_closed=true`,
  );

  const today = todayLocalMidnight();
  const candidates = [];

  for (const task of data.tasks) {
    const match = task.name.match(WEEKLY_NAME_RE);
    if (!match) continue;

    const [, sd, sm, sy, ed, em, ey] = match;
    const start = parseDate(sd, sm, sy);
    const end = parseDate(ed, em, ey);
    end.setHours(23, 59, 59, 999); // inclusive of the whole end day

    candidates.push({ task, start, end });

    if (today >= start && today <= end) {
      return { task, start, end };
    }
  }

  return { task: null, candidates }; // nothing matched; return what we saw for debugging
}

async function main() {
  console.log(`🔍 Searching list ${LIST_ID} for this week's task...\n`);
  const result = await findCurrentWeeklyTask();

  if (result.task) {
    console.log(`✅ Found: "${result.task.name}"`);
    console.log(`   Task ID: ${result.task.id}`);
    console.log(
      `   Range:   ${result.start.toDateString()} → ${result.end.toDateString()}`,
    );
  } else {
    console.log("❌ No matching weekly task found for today.");
    if (result.candidates?.length) {
      console.log("\nWeekly tasks that WERE found (for debugging):");
      result.candidates.forEach((c) =>
        console.log(`   - "${c.task.name}" (id: ${c.task.id})`),
      );
    } else {
      console.log(
        "\nNo tasks matching the 'Weekly DD/MM/YYYY <to> DD/MM/YYYY' pattern were found at all.",
      );
      console.log(
        "Check: is the list ID correct? Are these tasks nested deep enough that 'subtasks=true' isn't reaching them?",
      );
    }
  }
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});

module.exports = { findCurrentWeeklyTask, WEEKLY_NAME_RE };
