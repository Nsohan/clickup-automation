require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const BASE_URL = "https://api.clickup.com/api/v2";

const TASK_ID = process.argv[2];

if (!TASK_ID) {
  console.error("Usage: node scripts/inspect-task.js <task_id>");
  process.exit(1);
}

async function main() {
  const res = await fetch(
    `${BASE_URL}/task/${TASK_ID}?include_markdown_description=true`,
    { headers: { Authorization: API_TOKEN } },
  );

  if (!res.ok) {
    console.error(`❌ [${res.status}] ${await res.text()}`);
    process.exit(1);
  }

  const task = await res.json();

  console.log("=== task.description (raw) ===");
  console.log(JSON.stringify(task.description));
  console.log("\n=== task.text_content (raw) ===");
  console.log(JSON.stringify(task.text_content));
  console.log("\n=== task.markdown_description (raw) ===");
  console.log(JSON.stringify(task.markdown_description));
  console.log("\n=== task.description_markdown (raw) ===");
  console.log(JSON.stringify(task.description_markdown));
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
