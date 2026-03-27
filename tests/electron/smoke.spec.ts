import { test, expect } from "@playwright/test"
import { _electron as electron } from "playwright"
import type { Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const repoRoot = process.cwd()
const electronBinary = require("electron") as string

type SeededWorkspace = {
  project: {
    id: string
    name: string
    path: string
    gitRemoteUrl: null
    gitProvider: null
    gitOwner: null
    gitRepo: null
  }
  chatId: string
  subChatId: string
}

function createTempUserDataDir() {
  return mkdtempSync(path.join(tmpdir(), "1code-playwright-"))
}

async function launchApp(userDataDir: string) {
  return electron.launch({
    executablePath: electronBinary,
    cwd: repoRoot,
    args: ["."],
    env: {
      ...process.env,
      NODE_ENV: "test",
      ONECODE_USER_DATA_PATH: userDataDir,
      ONECODE_DISABLE_MCP_WARMUP: "true",
    },
  })
}

function seedWorkspaceDb(userDataDir: string): SeededWorkspace {
  const now = Date.now()
  const dataDir = path.join(userDataDir, "data")
  mkdirSync(dataDir, { recursive: true })
  const dbPath = path.join(dataDir, "agents.db")

  const projectId = "pw-project-1"
  const chatId = "pw-chat-1"
  const subChatId = "pw-subchat-1"
  const payload = JSON.stringify({
    dbPath,
    projectId,
    chatId,
    subChatId,
    repoRoot,
    now,
  })
  const script = `
import json, sqlite3, sys
payload = json.loads(sys.argv[1])
conn = sqlite3.connect(payload["dbPath"])
cur = conn.cursor()
cur.execute(
    """
    insert or replace into projects
      (id, name, path, created_at, updated_at, git_remote_url, git_provider, git_owner, git_repo, icon_path)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (payload["projectId"], "1Code", payload["repoRoot"], payload["now"], payload["now"], None, None, None, None, None),
)
cur.execute(
    """
    insert or replace into chats
      (id, name, project_id, created_at, updated_at, archived_at, worktree_path, branch, base_branch, pr_url, pr_number)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (payload["chatId"], "Playwright Diff Test", payload["projectId"], payload["now"], payload["now"], None, payload["repoRoot"], None, None, None, None),
)
cur.execute(
    """
    insert or replace into sub_chats
      (id, name, chat_id, session_id, stream_id, mode, messages, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (payload["subChatId"], "Diff comments", payload["chatId"], None, None, "agent", "[]", payload["now"], payload["now"]),
)
conn.commit()
conn.close()
`
  execFileSync("python3", ["-c", script, payload], { cwd: repoRoot, stdio: "inherit" })

  return {
    project: {
      id: projectId,
      name: "1Code",
      path: repoRoot,
      gitRemoteUrl: null,
      gitProvider: null,
      gitOwner: null,
      gitRepo: null,
    },
    chatId,
    subChatId,
  }
}

async function setLocalDesktopState(page: Page, seeded: SeededWorkspace) {
  await page.evaluate((payload) => {
    localStorage.setItem("onboarding:billing-method", JSON.stringify("api-key"))
    localStorage.setItem("onboarding:api-key-completed", JSON.stringify(true))
    localStorage.setItem("main:agents:selectedProject", JSON.stringify(payload.project))
    localStorage.setItem("main:agents:selectedChatId", JSON.stringify(payload.chatId))
    localStorage.setItem("main:agents:selectedChatIsRemote", JSON.stringify(false))
    localStorage.setItem("main:showNewChatForm", JSON.stringify(false))
  }, seeded)
}

test("launches the Electron app with isolated userData", async ({}, testInfo) => {
  const userDataDir = createTempUserDataDir()
  const app = await launchApp(userDataDir)

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState("domcontentloaded")

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const root = document.querySelector("#root")
          const bodyText = document.body?.innerText?.trim() || ""
          return {
            hasMountedRoot: !!root && root.childElementCount > 0,
            hasBodyText: bodyText.length > 0,
          }
        })
      })
      .toEqual({ hasMountedRoot: true, hasBodyText: true })

    await page.screenshot({
      path: testInfo.outputPath("app-launch.png"),
      fullPage: true,
    })
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test("shows diff comment affordance in a seeded local workspace", async ({}, testInfo) => {
  const userDataDir = createTempUserDataDir()

  const bootstrapApp = await launchApp(userDataDir)
  await bootstrapApp.firstWindow()
  await bootstrapApp.close()

  const seeded = seedWorkspaceDb(userDataDir)
  const app = await launchApp(userDataDir)

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState("domcontentloaded")
    await setLocalDesktopState(page, seeded)
    await page.reload()
    await page.waitForLoadState("domcontentloaded")

    const detailsButton = page.getByLabel("View details")
    await expect(detailsButton).toBeVisible({ timeout: 20_000 })
    await detailsButton.click()

    const diffButton = page.getByLabel("Expand changes")
    await expect(diffButton).toBeVisible({ timeout: 20_000 })
    await diffButton.click()

    const diffRow = page.locator("[data-line]").first()
    await expect(diffRow).toBeVisible({ timeout: 20_000 })
    await diffRow.hover()

    const addCommentButton = page.getByLabel("Add diff comment")
    await expect(addCommentButton).toBeVisible({ timeout: 10_000 })
    await addCommentButton.click()

    await expect(page.getByPlaceholder("Add your comment...")).toBeVisible({
      timeout: 10_000,
    })

    await page.screenshot({
      path: testInfo.outputPath("diff-comment-affordance.png"),
      fullPage: true,
    })
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
