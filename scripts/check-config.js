require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = process.env.CLICKUP_LIST_ID;
const BASE_URL = "https://api.clickup.com/api/v2";

async function clickupFetch(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: API_TOKEN },
  });
  if (!res.ok) {
    throw new Error(`[${res.status}] ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log("🔍 Fetching your ClickUp user info...\n");
  const user = await clickupFetch("/user");
  console.log(`User: ${user.user.username}`);
  console.log(`User ID: ${user.user.id}`);
  console.log(`Email: ${user.user.email}`);

  console.log(`\n🔍 Fetching statuses configured on List ${LIST_ID}...\n`);
  const list = await clickupFetch(`/list/${LIST_ID}`);
  console.log("Available statuses on this list:");
  list.statuses.forEach((s, i) => {
    console.log(`  ${i + 1}. "${s.status}"  (type: ${s.type})`);
  });

  console.log(`\n🔍 Fetching custom fields on List ${LIST_ID}...\n`);
  const fields = await clickupFetch(`/list/${LIST_ID}/field`);
  if (!fields.fields.length) {
    console.log("  No custom fields found on this list.");
  } else {
    fields.fields.forEach((f) => {
      console.log(`  Name: "${f.name}"  |  ID: ${f.id}  |  Type: ${f.type}`);
    });
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
