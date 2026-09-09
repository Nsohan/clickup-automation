require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const BASE_URL = "https://api.clickup.com/api/v2";

const TASK_ID = process.argv[2];

if (!TASK_ID) {
  console.error("Usage: node scripts/test-append-safety.js <task_id>");
  process.exit(1);
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

function todayLabel() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

const NEW_BLOCK = `

*   ${todayLabel()}: Complete Tasks:

    Campaign wire-up with wallets
    *   No balance, no plan active error handling
    *   Campaign Snapshot
        *   Can't edit or delete contacts selected on a campaign
        *   Can't delete a group if selected on any campaign

    *   Fixing 🔧⛏
`;

async function main() {
  console.log("STEP 1: Fetching current markdown_description...\n");
  const before = await clickupFetch(
    `/task/${TASK_ID}?include_markdown_description=true`,
  );
  console.log("── BEFORE (raw) ──");
  console.log(JSON.stringify(before.markdown_description));

  const combined = before.markdown_description + NEW_BLOCK;

  console.log(
    "\nSTEP 2: Writing back combined content via markdown_content...\n",
  );
  await clickupFetch(`/task/${TASK_ID}`, {
    method: "PUT",
    body: JSON.stringify({ markdown_content: combined }),
  });
  console.log("✅ Write completed.");

  console.log("\nSTEP 3: Re-fetching to verify...\n");
  const after = await clickupFetch(
    `/task/${TASK_ID}?include_markdown_description=true`,
  );
  console.log("── AFTER (raw) ──");
  console.log(JSON.stringify(after.markdown_description));

  console.log(
    "\nSTEP 4: Checking whether the ORIGINAL block survived intact...\n",
  );
  const originalPreserved =
    after.markdown_description.includes("Million Verifire") &&
    after.markdown_description.includes("ZeroBounce") &&
    after.markdown_description.includes("NeverBounce");

  const newBlockPresent = after.markdown_description.includes(
    "Campaign wire-up with wallets",
  );

  console.log(
    `Original content still present: ${originalPreserved ? "✅ YES" : "❌ NO — CORRUPTED"}`,
  );
  console.log(
    `New block successfully added:   ${newBlockPresent ? "✅ YES" : "❌ NO"}`,
  );
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exitCode = 1;
});
