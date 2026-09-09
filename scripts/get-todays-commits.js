require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_PATH = process.env.GIT_REPO_PATH;

if (!REPO_PATH) {
  console.error("❌ GIT_REPO_PATH is not set in .env");
  process.exit(1);
}

if (!fs.existsSync(path.join(REPO_PATH, ".git"))) {
  console.error(`❌ No .git folder found at: ${REPO_PATH}`);
  console.error("Check GIT_REPO_PATH in your .env file.");
  process.exit(1);
}

function run(cmd) {
  return execSync(`git -C "${REPO_PATH}" ${cmd}`, {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 50,
  }).trim();
}

function getTodaysCommitHashes() {
  const output = run(`log --since="midnight" --pretty=format:"%H"`);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

function getCommitDetails(hash) {
  const meta = run(`show ${hash} --no-patch --pretty=format:"%H|||%an|||%ad|||%s"`);
  const [commitHash, author, date, ...subjectParts] = meta.split("|||");
  const subject = subjectParts.join("|||");

  const fullMessage = run(`show ${hash} -s --format=%B`);
  const changedFiles = run(`diff-tree --no-commit-id --name-status -r ${hash}`)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...fileParts] = line.split("\t");
      return { status, file: fileParts.join("\t") };
    });

  const diff = run(`show ${hash} --pretty=format:"" --patch`);

  return { hash: commitHash, author, date, subject, message: fullMessage.trim(), changedFiles, diff };
}

function main() {
  const hashes = getTodaysCommitHashes();

  if (hashes.length === 0) {
    console.log(`No commits found for today in: ${REPO_PATH}`);
    process.exit(0);
  }

  const commits = hashes.map((hash) => getCommitDetails(hash));

  const output = {
    generatedAt: new Date().toISOString(),
    repo: path.basename(REPO_PATH),
    repoPath: REPO_PATH,
    totalCommits: commits.length,
    commits,
  };

  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, "todays-commits.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅ Wrote ${commits.length} commit(s) to ${outPath}`);
  console.log(`   (source repo: ${REPO_PATH})`);
}

main();