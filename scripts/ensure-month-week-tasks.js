require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { monthLabel, weekTaskName, getWeekRange, fmt } = require("./week-logic");

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = process.env.CLICKUP_LIST_ID;
const BASE_URL = "https://api.clickup.com/api/v2";

const ASSIGNEE_ID = 278558875; // Sohan
const STATUS_IN_PROGRESS = "in progress";
const END_DATE_FIELD_ID = "f784a2a4-113d-4c53-b7c9-f331074be8d8";

if (!API_TOKEN || !LIST_ID) {
  console.error("Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID in .env");
  process.exitCode = 1;
} else {
  const SHOULD_CREATE = process.argv.includes("--create");
  const dateArg = process.argv.find((a) => a.startsWith("--date="));
  const TARGET_DATE = dateArg
    ? new Date(dateArg.split("=")[1] + "T00:00:00")
    : new Date();

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

  async function fetchAllTasks() {
    let allTasks = [];
    let page = 0;

    while (true) {
      const data = await clickupFetch(
        `/list/${LIST_ID}/task?subtasks=true&include_closed=true&page=${page}`,
      );
      allTasks = allTasks.concat(data.tasks);

      // ClickUp returns up to 100 tasks per page. If we got fewer than
      // that (or the API says it's the last page), we're done.
      if (data.tasks.length === 0 || data.last_page) break;
      page += 1;

      // Safety valve so a bug here can never loop forever.
      if (page > 50) {
        console.warn(
          "⚠️  Stopped after 50 pages — check for a pagination bug.",
        );
        break;
      }
    }

    return allTasks;
  }

  function findYearTask(tasks, year) {
    return tasks.find(
      (t) =>
        t.name.includes("Sohan's Task Reports") &&
        t.name.includes(String(year)),
    );
  }

  function findChildByName(tasks, parentId, name) {
    return tasks.find((t) => t.parent === parentId && t.name === name);
  }

  async function createTask(
    name,
    parentId,
    { description, startMs, dueMs } = {},
  ) {
    const body = {
      name,
      parent: parentId,
      assignees: [ASSIGNEE_ID],
      status: STATUS_IN_PROGRESS,
      ...(description ? { description } : {}),
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
    if (existing) return { task: existing, created: false };

    if (!SHOULD_CREATE) {
      return { task: null, created: false, wouldCreate: name };
    }

    const task = await createTask(name, yearTaskId);
    return { task, created: true };
  }

  async function ensureWeekTask(tasks, monthTaskId, date) {
    const name = weekTaskName(date);
    const existing = findChildByName(tasks, monthTaskId, name);
    if (existing) return { task: existing, created: false };

    const { start, end } = getWeekRange(date);
    const description = `Task List for This Week ${fmt(start)} <to> ${fmt(end)}\n \n`;

    if (!SHOULD_CREATE) {
      return { task: null, created: false, wouldCreate: name };
    }

    const task = await createTask(name, monthTaskId, {
      description,
      startMs: dateToMs(start),
      dueMs: dateToMs(end),
    });
    return { task, created: true };
  }

  async function main() {
    console.log(`Target date: ${TARGET_DATE.toDateString()}`);
    console.log(
      `Mode: ${SHOULD_CREATE ? "CREATE (will modify ClickUp)" : "DRY RUN (read-only)"}\n`,
    );

    const tasks = await fetchAllTasks();
    console.log(`(fetched ${tasks.length} total tasks from the list)\n`);

    const yearTask = findYearTask(tasks, TARGET_DATE.getFullYear());
    if (!yearTask) {
      console.error(
        `❌ Could not find the year task "Sohan's Task Reports - ${TARGET_DATE.getFullYear()}". Stopping.`,
      );
      console.log("\nTop-level tasks found (no parent), for debugging:");
      tasks
        .filter((t) => !t.parent)
        .forEach((t) => console.log(`   - "${t.name}" (id: ${t.id})`));
      process.exitCode = 1;
      return;
    }
    console.log(`✅ Year task: "${yearTask.name}" (${yearTask.id})`);

    const monthResult = await ensureMonthTask(tasks, yearTask.id, TARGET_DATE);
    if (monthResult.task) {
      console.log(
        `${monthResult.created ? "🆕 Created" : "✅ Found"} month task: "${monthResult.task.name}" (${monthResult.task.id})`,
      );
    } else {
      console.log(
        `⚠️  Would CREATE month task: "${monthResult.wouldCreate}" (run with --create to actually do it)`,
      );
      console.log(
        "   Stopping here in dry-run since the week task depends on the month task existing.",
      );
      return;
    }

    const weekResult = await ensureWeekTask(
      tasks,
      monthResult.task.id,
      TARGET_DATE,
    );
    if (weekResult.task) {
      console.log(
        `${weekResult.created ? "🆕 Created" : "✅ Found"} week task: "${weekResult.task.name}" (${weekResult.task.id})`,
      );
    } else {
      console.log(
        `⚠️  Would CREATE week task: "${weekResult.wouldCreate}" (run with --create to actually do it)`,
      );
    }
  }

  main().catch((err) => {
    console.error("\n❌ Failed:", err.message);
    process.exitCode = 1;
  });
}
