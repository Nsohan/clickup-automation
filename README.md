# ClickUp Git Commit Push Pipeline

This project contains a semi-automated pipeline that extracts today's Git commits from a local monorepo, allows an AI assistant to analyze and organize those commits into a structured, nested Epic/Task/Subtask hierarchy, and pushes that hierarchy directly to a ClickUp list.

---

## Features

- **Automated Commit Extraction**: Retrieves git commits since midnight, including metadata, full commit messages, list of changed files, and git diff.
- **Hierarchical Structuring**: Models tasks into ClickUp tasks and subtasks at multiple levels:
  - **Epic**: A parent task representing the overall day's goal.
  - **Tasks**: Top-level tasks representing logical components or feature areas.
  - **Subtasks**: Child tasks indicating detailed implementation steps (can be nested recursively).
- **Rich ClickUp Metadata Integration**:
  - Automatically sets task assignees.
  - Sets Start Date and End Date (using a custom field) to today.
  - Attaches commit notes/context as ClickUp task comments.
  - Creates ClickUp checklists for **Acceptance Criteria**.
  - Maps appropriate statuses (e.g., "in progress" for top-level epics/tasks, and "done" for completed nested subtasks).

---

## Directory Structure

```text
├── data/
│   ├── task.txt                 # Structured JSON data ready to be pushed to ClickUp (AI-generated)
│   └── todays-commits.json      # Raw commit metadata and diffs extracted from the git repository
├── scripts/
│   ├── check-config.js          # Utility to verify ClickUp API credentials and list settings
│   ├── get-todays-commits.js    # Extracts today's git commits since midnight to todays-commits.json
│   └── push-to-clickup.js       # Pushes task structure from task.txt to ClickUp
├── .env                         # Local environment variables containing secrets & configurations
├── check-config.bat             # Batch script shortcut to run config checks
├── get-commits.bat              # Batch script shortcut to extract today's commits
├── push-tasks.bat               # Batch script shortcut to run ClickUp push
├── package.json                 # Node.js project manifest
└── README.md                    # This document
```

---

## Setup & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended, as it uses the native `fetch` API)
- Git command line tool installed and accessible in the system path

### 1. Install Dependencies

Clone this folder to your local machine and install the required npm dependencies:

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root of the project directory with the following variables:

```ini
CLICKUP_API_TOKEN=your_personal_clickup_api_token
CLICKUP_LIST_ID=your_target_clickup_list_id
GIT_REPO_PATH=C:/path/to/your/git/repository
```

*Note: Ensure `GIT_REPO_PATH` points to the absolute directory containing the `.git` folder of your target repository.*

### 3. Verify Configuration

Run the configuration check script to ensure the API token is valid and you have access to the target list:

```bash
check-config.bat
```

This script will display the authenticated ClickUp user, list statuses, and any custom fields configured on the list.

---

## Pipeline Workflow

Follow these steps to extract your daily commits and push them to ClickUp:

### Step 1: Extract Commits
Run the extraction script to query all commits made since midnight in your configured repository:

```bash
get-commits.bat
```

This generates `data/todays-commits.json` containing metadata, file diffs, and changes.

### Step 2: Generate Task Structure
Feed the contents of `data/todays-commits.json` to your AI assistant (e.g., Antigravity/Gemini). Ask the assistant to group the changes logically, add notes, and structure them into the JSON format expected by ClickUp.

Save this AI-structured output as `data/task.txt`.

### Step 3: Push Tasks to ClickUp
Once `data/task.txt` is populated with the structured JSON, execute the push script:

```bash
push-tasks.bat
```

This script reads `data/task.txt`, builds the parent Epic task, and recursively populates the Tasks and Subtasks in ClickUp.

---

## JSON Task Schema (`data/task.txt`)

The `data/task.txt` file must contain a valid JSON object matching the following structure:

```json
{
  "epic": {
    "name": "Brief Title of Today's Epic",
    "description": "General summary of the changes and goals achieved.",
    "notes": "Optional. Text added as a comment to the epic task."
  },
  "tasks": [
    {
      "name": "1. Short Feature/Bug Task Name (Sequentially Numbered)",
      "description": "Detailed description of the task requirements.",
      "notes": "Optional. Comment to be added to this task.",
      "acceptanceCriteria": [
        "Testable condition 1",
        "Testable condition 2"
      ],
      "subtasks": [
        {
          "name": "1. Nested Subtask Name (Numbered starting from 1)",
          "description": "Description of subtask work.",
          "notes": "Optional. Comment to be added to this subtask.",
          "subtasks": []
        }
      ]
    }
  ]
}
```

### Conventions
1. **Title Length**: Keep task and subtask titles short and scannable (4–8 words, under 50 characters).
2. **Numbering**:
   - Top-level tasks are numbered sequentially (e.g., `"1. Task Name"`, `"2. Task Name"`).
   - Subtasks under each parent task restart numbering from 1 (e.g., `"1. Subtask Name"`, `"2. Subtask Name"`).
3. **Acceptance Criteria**: Provide 2–4 concrete criteria for top-level tasks. These will be added as a ClickUp checklist.
4. **Comments vs. Description**: Place implementation details, file names, or specific warnings in `description` or `notes`. The `notes` field is added as a separate comment in ClickUp.
