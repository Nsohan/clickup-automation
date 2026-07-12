require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const fs = require("fs");
const path = require("path");

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = process.env.CLICKUP_LIST_ID;
const BASE_URL = "https://api.clickup.com/api/v2";

const ASSIGNEE_ID = 278558875; // Sohan
const STATUS_TOP_LEVEL = "in progress"; // Epic + main tasks
const STATUS_NESTED = "done"; // All nested subtasks
const END_DATE_FIELD_ID = "f784a2a4-113d-4c53-b7c9-f331074be8d8"; // "End Date" custom field

if (!API_TOKEN || !LIST_ID) {
  console.error("Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID in .env");
  process.exit(1);
}

function todayStartOfDayMs() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
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
  description,
  { parentId = null, status = null, setDates = false } = {},
) {
  const body = {
    name,
    description: description || "",
    assignees: [ASSIGNEE_ID],
    ...(parentId ? { parent: parentId } : {}),
    ...(status ? { status } : {}),
    ...(setDates
      ? { start_date: todayStartOfDayMs(), start_date_time: false }
      : {}),
  };

  const task = await clickupFetch(`/list/${LIST_ID}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  console.log(
    `  ✅ Created: "${name}" (${task.id})${status ? ` [${status}]` : ""}${parentId ? ` [parent: ${parentId}]` : ""}`,
  );

  if (setDates) {
    await setEndDateField(task.id);
  }

  return task;
}

async function setEndDateField(taskId) {
  await clickupFetch(`/task/${taskId}/field/${END_DATE_FIELD_ID}`, {
    method: "POST",
    body: JSON.stringify({ value: todayStartOfDayMs() }),
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

// Every task gets Start Date = today and End Date (custom field) = today.
// Top-level tasks -> "in progress". Nested subtasks (any depth) -> "done".
async function createTaskRecursive(node, parentId, depth = 0) {
  const indent = "  ".repeat(depth + 1);

  const isTopLevel = depth === 0;
  const status = isTopLevel ? STATUS_TOP_LEVEL : STATUS_NESTED;

  const createdTask = await createTask(node.name, node.description, {
    parentId,
    status,
    setDates: true,
  });

  if (node.notes) {
    await addComment(createdTask.id, node.notes);
    console.log(`${indent}📝 Added note`);
  }

  if (node.acceptanceCriteria?.length) {
    const acChecklist = await addChecklist(
      createdTask.id,
      "Acceptance Criteria",
    );
    for (const ac of node.acceptanceCriteria)
      await addChecklistItem(acChecklist.id, ac);
    console.log(
      `${indent}☑️  Added ${node.acceptanceCriteria.length} acceptance criterion/criteria`,
    );
  }

  if (node.subtasks?.length) {
    for (const sub of node.subtasks) {
      await createTaskRecursive(sub, createdTask.id, depth + 1);
    }
  }

  return createdTask;
}

async function main() {
  const inputPath = path.join(__dirname, "..", "data", "task.txt");
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } catch (e) {
    console.error("❌ task.txt is not valid JSON:", e.message);
    process.exit(1);
  }

  console.log(`\n🚀 Creating epic: "${data.epic.name}"`);
  const epicTask = await createTask(data.epic.name, data.epic.description, {
    status: STATUS_TOP_LEVEL,
    setDates: true,
  });
  if (data.epic.notes) await addComment(epicTask.id, data.epic.notes);

  for (const task of data.tasks) {
    console.log(`\n  📌 Task: "${task.name}"`);
    await createTaskRecursive(task, epicTask.id, 0);
  }

  console.log(
    `\n✅ Done. Epic + ${data.tasks.length} top-level task(s), fully nested, pushed to ClickUp.`,
  );
  console.log(
    `   Assignee: Sohan | Top-level status: "${STATUS_TOP_LEVEL}" | Nested status: "${STATUS_NESTED}"`,
  );
  console.log(`   Start Date and End Date both set to today on every task.`);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
