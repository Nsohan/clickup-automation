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
const STATUS_TOP_LEVEL = "in progress";
const STATUS_NESTED = "done";
const END_DATE_FIELD_ID = "f784a2a4-113d-4c53-b7c9-f331074be8d8"; // "End Date" custom field

const SHOULD_POST = process.argv.includes("--post");
const SHOULD_FORCE = process.argv.includes("--force");

if (!API_TOKEN || !LIST_ID) {
  console.error("Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID in .env");
  process.exitCode = 1;
} else {
  main();
}

function todayStartOfDayMs() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
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
    const errText = await res.text();
    throw new Error(
      `ClickUp API error [${res.status}] on ${endpoint}: ${errText}`,
    );
  }
  return res.json();
}

async function createTask(
  name,
  description = "",
  { parentId = null, status = null, setDates = false, markdownContent = null, startMs = null, dueMs = null } = {},
) {
  const body = {
    name,
    description: description || "",
    assignees: [ASSIGNEE_ID],
    ...(parentId ? { parent: parentId } : {}),
    ...(status ? { status } : {}),
    ...(markdownContent ? { markdown_content: markdownContent } : {}),
    ...(setDates || startMs ? { start_date: startMs || todayStartOfDayMs(), start_date_time: false } : {}),
    ...(dueMs ? { due_date: dueMs, due_date_time: false } : {}),
  };

  const task = await clickupFetch(`/list/${LIST_ID}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (setDates || dueMs) {
    try {
      await setEndDateField(task.id, dueMs || todayStartOfDayMs());
    } catch (e) {
      if (!e.message.includes("FIELD_033") && !e.message.includes("usages exceeded")) {
        console.warn(`  ⚠️ Custom field warning: ${e.message}`);
      }
    }
  }

  return task;
}

async function setEndDateField(taskId, dateMs) {
  await clickupFetch(`/task/${taskId}/field/${END_DATE_FIELD_ID}`, {
    method: "POST",
    body: JSON.stringify({ value: dateMs }),
  });
}

async function addComment(taskId, commentText) {
  await clickupFetch(`/task/${taskId}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment_text: commentText }),
  });
}

async function addChecklist(taskId, checklistName) {
  const checklist = await clickupFetch(`/task/${taskId}/checklist`, {
    method: "POST",
    body: JSON.stringify({ name: checklistName }),
  });
  return checklist.checklist;
}

async function addChecklistItem(checklistId, itemName) {
  await clickupFetch(`/checklist/${checklistId}/checklist_item`, {
    method: "POST",
    body: JSON.stringify({ name: itemName }),
  });
}

async function createTaskRecursive(node, parentId, depth = 0) {
  const indent = "  ".repeat(depth + 1);
  const isTopLevel = depth === 0;
  const status = isTopLevel ? STATUS_TOP_LEVEL : STATUS_NESTED;

  const createdTask = await createTask(node.name, node.description, {
    parentId,
    status,
    setDates: true,
  });

  console.log(
    `${indent}✅ Created: "${node.name}" (${createdTask.id}) [${status}]`,
  );

  if (node.notes) {
    await addComment(createdTask.id, node.notes);
    console.log(`${indent}  📝 Added comment`);
  }

  if (node.acceptanceCriteria?.length) {
    const acChecklist = await addChecklist(
      createdTask.id,
      "Acceptance Criteria",
    );
    for (const ac of node.acceptanceCriteria) {
      await addChecklistItem(acChecklist.id, ac);
    }
    console.log(
      `${indent}  ☑️  Added ${node.acceptanceCriteria.length} acceptance criterion/criteria`,
    );
  }

  if (node.subtasks?.length) {
    for (const sub of node.subtasks) {
      await createTaskRecursive(sub, createdTask.id, depth + 1);
    }
  }

  return createdTask;
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
    if (page > 50) break;
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

async function ensureMonthTask(tasks, yearTaskId, date) {
  const name = monthLabel(date);
  const existing = findChildByName(tasks, yearTaskId, name);
  if (existing) return existing;

  console.log(`🆕 Month task "${name}" doesn't exist yet — creating it...`);
  return createTask(name, "", { parentId: yearTaskId, status: STATUS_TOP_LEVEL });
}

async function ensureWeekTask(tasks, monthTaskId, date) {
  const name = weekTaskName(date);
  const existing = findChildByName(tasks, monthTaskId, name);
  if (existing) return existing;

  console.log(`🆕 Week task "${name}" doesn't exist yet — creating it...`);
  const { start, end } = getWeekRange(date);
  const markdownContent = `Task List for This Week ${fmt(start)} <to> ${fmt(end)}\n \n`;

  return createTask(name, "", {
    parentId: monthTaskId,
    status: STATUS_TOP_LEVEL,
    markdownContent,
    startMs: dateToMs(start),
    dueMs: dateToMs(end),
  });
}

function renderItems(items, depth = 1) {
  const indent = "    ".repeat(depth);
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

function buildTodayBlock(dailyNotes) {
  const header = `*   ${todayLabel()}: Complete Tasks:\n\n`;
  const body = renderItems(dailyNotes);
  return `\n\n\n${header}${body}`;
}

function findInputData() {
  const possiblePaths = [
    path.join(__dirname, "..", "data", "daily-tasks.json"),
    path.join(__dirname, "..", "data", "task.txt"),
    path.join(__dirname, "..", "data", "daily-note.json"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        return { data: parsed, filePath: p };
      } catch (e) {
        // continue trying next file
      }
    }
  }
  return null;
}

async function main() {
  const input = findInputData();
  if (!input) {
    console.error("❌ No valid JSON data file found in data/ folder.");
    console.error("Expected data/daily-tasks.json (or data/task.txt).");
    process.exitCode = 1;
    return;
  }

  const { data, filePath } = input;
  console.log(`📁 Loaded data from: ${path.basename(filePath)}`);

  // Normalize dailyNotes for the description block
  let dailyNotes = data.dailyNotes || data.items;
  if (!dailyNotes && data.tasks) {
    // Derive from epic/tasks if not provided explicitly
    dailyNotes = [
      {
        text: data.epic?.name || "Daily Tasks",
        children: data.tasks.map((t) => ({
          text: t.name,
          children: t.subtasks?.map((s) => s.name) || [],
        })),
      },
    ];
  }

  const hasEpicAndTasks = Boolean(data.epic && Array.isArray(data.tasks));
  const hasDailyNotes = Boolean(Array.isArray(dailyNotes) && dailyNotes.length > 0);

  console.log("\n==================== PUSH PLAN ====================");
  if (hasEpicAndTasks) {
    console.log(`📌 Epic Ticket to create: "${data.epic.name}"`);
    console.log(`   Tasks count: ${data.tasks.length}`);
  } else {
    console.log("ℹ️  No Epic/Tasks structure found (only daily note block will be pushed).");
  }

  if (hasDailyNotes) {
    console.log(`📝 Daily note block for Weekly Report:`);
    console.log(buildTodayBlock(dailyNotes));
  }
  console.log("===================================================\n");

  if (!SHOULD_POST) {
    console.log("ℹ️  Dry run only (no --post flag). Nothing was written to ClickUp.");
    console.log("   Run with --post to create task tickets and update the weekly description.");
    return;
  }

  // 1. CREATE CLICKUP TASK TICKETS
  if (hasEpicAndTasks) {
    console.log(`🚀 Step 1: Creating ClickUp Epic & Task tickets...`);
    const epicTask = await createTask(data.epic.name, data.epic.description, {
      status: STATUS_TOP_LEVEL,
      setDates: true,
    });
    console.log(`✅ Created Epic: "${data.epic.name}" (${epicTask.id}) [${STATUS_TOP_LEVEL}]`);

    if (data.epic.notes) {
      await addComment(epicTask.id, data.epic.notes);
      console.log(`  📝 Added comment on Epic`);
    }

    for (const task of data.tasks) {
      console.log(`\n  📌 Processing Task: "${task.name}"`);
      await createTaskRecursive(task, epicTask.id, 0);
    }
    console.log(`\n🎉 All task tickets created successfully.\n`);
  }

  // 2. APPEND DAILY NOTES TO WEEKLY REPORT DESCRIPTION
  if (hasDailyNotes) {
    console.log(`🚀 Step 2: Appending daily summary to Weekly Report description...`);
    const today = new Date();
    const tasks = await fetchAllTasks();

    const yearTask = findYearTask(tasks, today.getFullYear());
    if (!yearTask) {
      console.error(`❌ Could not find Year task for ${today.getFullYear()}.`);
      process.exitCode = 1;
      return;
    }

    const monthTask = await ensureMonthTask(tasks, yearTask.id, today);
    const weekTask = await ensureWeekTask(tasks, monthTask.id, today);
    console.log(`✅ Target Week task: "${weekTask.name}" (${weekTask.id})`);

    const current = await clickupFetch(
      `/task/${weekTask.id}?include_markdown_description=true`,
    );

    const dateLabel = `${todayLabel()}:`;
    if (current.markdown_description && current.markdown_description.includes(dateLabel)) {
      console.warn(`⚠️  Warning: Description already contains an entry for today (${dateLabel}).`);
      if (!SHOULD_FORCE) {
        console.warn("   Skipping description update to prevent duplicates.");
        console.warn("   (Pass --force to re-append anyway)\n");
      } else {
        console.log("   (--force flag detected: appending anyway)\n");
        const todayBlock = buildTodayBlock(dailyNotes);
        const combined = (current.markdown_description || "") + todayBlock;
        await clickupFetch(`/task/${weekTask.id}`, {
          method: "PUT",
          body: JSON.stringify({ markdown_content: combined }),
        });
        console.log("✅ Weekly report description updated successfully.");
      }
    } else {
      const todayBlock = buildTodayBlock(dailyNotes);
      const combined = (current.markdown_description || "") + todayBlock;
      await clickupFetch(`/task/${weekTask.id}`, {
        method: "PUT",
        body: JSON.stringify({ markdown_content: combined }),
      });
      console.log("✅ Weekly report description updated successfully.");
    }
  }

  console.log("\n🏁 All actions completed successfully!");
}
