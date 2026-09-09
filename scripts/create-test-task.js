require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = process.env.CLICKUP_LIST_ID;
const BASE_URL = "https://api.clickup.com/api/v2";
const ASSIGNEE_ID = 278558875;

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

// Mimics the real structure: intro line, nested bullets, trailing "Fixing" bullet,
// including an intentionally "messy" empty bullet like the real task has.
const SEED_MARKDOWN = `Task List for This Week TEST <to> TEST

*   06.09.2026: Complete Tasks:

    Research the email verification system
    *   Million Verifire
    *   ZeroBounce
    *   NeverBounce
    *   How to implement
    *   Email Verification core system to build one

    *   Fixing 🔧⛏
`;

async function main() {
  console.log("🧪 Creating throwaway test task...");
  const task = await clickupFetch(`/list/${LIST_ID}/task`, {
    method: "POST",
    body: JSON.stringify({
      name: "TEST - description round-trip safety check (safe to delete)",
      assignees: [ASSIGNEE_ID],
      markdown_content: SEED_MARKDOWN,
    }),
  });

  console.log(`✅ Created test task: "${task.name}"`);
  console.log(`   Task ID: ${task.id}`);
  console.log(`\nNext: run scripts/test-append-safety.js ${task.id}`);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exitCode = 1;
});
