require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const fs = require("fs");
const path = require("path");
const { monthLabel, weekTaskName, getWeekRange, fmt } = require("./week-logic");

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = process.env.CLICKUP_LIST_ID;
const BASE_URL = "https://api.clickup.com/api/v2";

const ASSIGNEE_ID = 278558875; // Sohan
const STATUS_IN_PROGRESS = "in progress";
const END_DATE_FIELD_ID = "f784a2a4-113d-4c53-b7c9-f331074be8d8";

const INPUT_PATH = path.join(__dirname, "..", "data", "daily-note.json");
const SHOULD_POST = process.argv.includes("--post");

if (!API_TOKEN || !LIST_ID) {
  console.error("Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID in .env");
  process.exitCode = 1;
} else {
  run();
}

async function clickupFetch(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: API_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `ClickUp API error [${res.status}] on ${endpoint}: ${await res.text()}`,
    );
  }
  return res.json();
}

function dateToMs(d) {
  return new Date(d).setHours(0, 0, 0, 0);
}

function todayLabel() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

async function fetchAllTasks() {
  let allTasks = [];
  let page = 0;

  while (true) {
    const data = await clickupFetch(
      `/list/${LIST_ID}/task?subtasks=true&include_closed=true&page=${page}`,
    );
    allTasks = allTasks.concat(data.tasks);
    if (data.tasks.length === 0 || data.last_page) break;
    page += 1;
    if (page > 50) {
      console.warn("⚠️  Stopped after 50 pages — check for a pagination bug.");
      break;
    }
  }

  return allTasks;
}

function findYearTask(tasks, year) {
  return tasks.find(
    (t) =>
      t.name.includes("Sohan's Task Reports") && t.name.includes(String(year)),
  );
}

function findChildByName(tasks, parentId, name) {
  return tasks.find((t) => t.parent === parentId && t.name === name);
}

async function createTask(
  name,
  parentId,
  { markdownContent, startMs, dueMs } = {},
) {
  const body = {
    name,
    parent: parentId,
    assignees: [ASSIGNEE_ID],
    status: STATUS_IN_PROGRESS,
    ...(markdownContent ? { markdown_content: markdownContent } : {}),
    ...(startMs ? { start_date: startMs, start_date_time: false } : {}),
    ...(dueMs ? { due_date: dueMs, due_date_time: false } : {}),
  };

  const task = await clickupFetch(`/list/${LIST_ID}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (dueMs) {
    await clickupFetch(`/task/${task.id}/field/${END_DATE_FIELD_ID}`, {
      method: "POST",
      body: JSON.stringify({ value: dueMs }),
    });
  }

  return task;
}

async function ensureMonthTask(tasks, yearTaskId, date) {
  const name = monthLabel(date);
  const existing = findChildByName(tasks, yearTaskId, name);
  if (existing) return existing;

  console.log(`🆕 Month task "${name}" doesn't exist yet — creating it...`);
  return createTask(name, yearTaskId);
}

async function ensureWeekTask(tasks, monthTaskId, date) {
  const name = weekTaskName(date);
  const existing = findChildByName(tasks, monthTaskId, name);
  if (existing) return existing;

  console.log(`🆕 Week task "${name}" doesn't exist yet — creating it...`);
  const { start, end } = getWeekRange(date);
  const markdownContent = `Task List for This Week ${fmt(start)} <to> ${fmt(end)}\n \n`;

  return createTask(name, monthTaskId, {
    markdownContent,
    startMs: dateToMs(start),
    dueMs: dateToMs(end),
  });
}

/**
 * Recursively renders items into ClickUp-style "*   " bullet markdown.
 * item can be a plain string, or { text, children[] }.
 */
function renderItems(items, depth = 1) {
  const indent = "    ".repeat(depth); // 4 spaces per level, matches ClickUp's export style
  let out = "";

  for (const item of items) {
    if (typeof item === "string") {
      out += `${indent}*   ${item}\n`;
    } else if (item && typeof item === "object" && item.text) {
      out += `${indent}*   ${item.text}\n`;
      if (Array.isArray(item.children) && item.children.length) {
        out += renderItems(item.children, depth + 1);
      }
    }
  }

  return out;
}

function buildTodayBlock(data) {
  const header = `*   ${todayLabel()}: Complete Tasks:\n\n`;
  const body = renderItems(data.items || []);
  return `\n${header}${body}`;
}

async function run() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`File not found: ${INPUT_PATH}`);
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"));
  } catch (e) {
    console.error("❌ daily-note.json is not valid JSON:", e.message);
    process.exitCode = 1;
    return;
  }

  const today = new Date();

  console.log("🔍 Fetching all tasks (this can take a moment)...");
  const tasks = await fetchAllTasks();
  console.log(`(fetched ${tasks.length} total tasks)\n`);

  const yearTask = findYearTask(tasks, today.getFullYear());
  if (!yearTask) {
    console.error(
      `❌ Could not find the year task for ${today.getFullYear()}. Stopping.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Year task: "${yearTask.name}"`);

  const monthTask = await ensureMonthTask(tasks, yearTask.id, today);
  console.log(`✅ Month task: "${monthTask.name}" (${monthTask.id})`);

  const weekTask = await ensureWeekTask(tasks, monthTask.id, today);
  console.log(`✅ Week task: "${weekTask.name}" (${weekTask.id})\n`);

  console.log("🔍 Fetching current description of the week task...");
  const current = await clickupFetch(
    `/task/${weekTask.id}?include_markdown_description=true`,
  );

  const todayBlock = buildTodayBlock(data);
  const combined = (current.markdown_description || "") + todayBlock;

  console.log("──────── PREVIEW: block being appended ────────");
  console.log(todayBlock);
  console.log("────────────────────────────────────────────────\n");

  if (!SHOULD_POST) {
    console.log(
      "ℹ️  Dry run only (no --post flag). Nothing was written to ClickUp.",
    );
    console.log("   Run again with --post to actually update the description.");
    return;
  }

  console.log("🚀 Writing combined description back to ClickUp...");
  await clickupFetch(`/task/${weekTask.id}`, {
    method: "PUT",
    body: JSON.stringify({ markdown_content: combined }),
  });
  console.log("✅ Description updated successfully.");
}
