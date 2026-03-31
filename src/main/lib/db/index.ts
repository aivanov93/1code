import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { and, eq, isNull, isNotNull } from "drizzle-orm"
import { app } from "electron"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import * as schema from "./schema"

let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqlite: Database.Database | null = null

/**
 * Get the database path in the app's user data directory
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath("userData")
  const dataDir = join(userDataPath, "data")

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  return join(dataDir, "agents.db")
}

/**
 * Get the migrations folder path
 * Handles both development and production (packaged) environments
 */
function getMigrationsPath(): string {
  if (app.isPackaged) {
    // Production: migrations bundled in resources
    return join(process.resourcesPath, "migrations")
  }
  // Development: from out/main -> apps/desktop/drizzle
  return join(__dirname, "../../drizzle")
}

/**
 * Initialize the database with Drizzle ORM
 */
export function initDatabase() {
  if (db) {
    return db
  }

  const dbPath = getDatabasePath()
  console.log(`[DB] Initializing database at: ${dbPath}`)

  // Create SQLite connection
  sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  // Create Drizzle instance
  db = drizzle(sqlite, { schema })

  // Run migrations
  const migrationsPath = getMigrationsPath()
  console.log(`[DB] Running migrations from: ${migrationsPath}`)

  try {
    migrate(db, { migrationsFolder: migrationsPath })
    console.log("[DB] Migrations completed")
  } catch (error) {
    console.error("[DB] Migration error:", error)
    throw error
  }

  // Seed system folders if they don't exist
  seedSystemFolders(db)

  // Clear stale streamIds from any sub_chats that were mid-stream when the app last exited.
  // No Claude process survives a restart, so these would cause useChat to attempt
  // resume with reconnectToStream() returning null, leaving the chat stuck.
  const cleared = db.update(schema.subChats)
    .set({ streamId: null })
    .where(isNotNull(schema.subChats.streamId))
    .run()
  if (cleared.changes > 0) {
    console.log(`[DB] Cleared ${cleared.changes} stale stream_id(s) from sub_chats`)
  }

  return db
}

// Well-known IDs for system folders so they're stable across migrations
export const UNCATEGORIZED_FOLDER_ID = "system_uncategorized"
export const ARCHIVED_FOLDER_ID = "system_archived"

function seedSystemFolders(db: ReturnType<typeof drizzle<typeof schema>>) {
  const existing = db.select().from(schema.folders).where(eq(schema.folders.system, true)).all()
  const hasUncategorized = existing.some((f) => f.id === UNCATEGORIZED_FOLDER_ID)
  const hasArchived = existing.some((f) => f.id === ARCHIVED_FOLDER_ID)

  if (!hasUncategorized) {
    db.insert(schema.folders).values({
      id: UNCATEGORIZED_FOLDER_ID,
      name: "Uncategorized",
      icon: "inbox",
      color: "#6b7280",
      position: "a0",
      system: true,
    }).run()
    console.log("[DB] Created Uncategorized system folder")
  }

  if (!hasArchived) {
    db.insert(schema.folders).values({
      id: ARCHIVED_FOLDER_ID,
      name: "Archived",
      icon: "archive",
      color: "#6b7280",
      position: "z0", // always last
      system: true,
    }).run()
    console.log("[DB] Created Archived system folder")
  }

  // Always ensure chats without a folder get assigned
  // Archived chats -> Archived folder, rest -> Uncategorized
  const archivedMigrated = db.update(schema.chats)
    .set({ folderId: ARCHIVED_FOLDER_ID })
    .where(and(isNotNull(schema.chats.archivedAt), isNull(schema.chats.folderId)))
    .run()

  const uncategorizedMigrated = db.update(schema.chats)
    .set({ folderId: UNCATEGORIZED_FOLDER_ID })
    .where(isNull(schema.chats.folderId))
    .run()

  if (archivedMigrated.changes > 0 || uncategorizedMigrated.changes > 0) {
    console.log(`[DB] Migrated chats to folders: ${archivedMigrated.changes} archived, ${uncategorizedMigrated.changes} uncategorized`)
  }

  // Assign unique positions to chats that share the default "a0" position within each folder.
  // Without this, reordering fails because generateKeyBetween("a0", "a0") throws.
  const allFolderIds = db.select({ folderId: schema.chats.folderId }).from(schema.chats).groupBy(schema.chats.folderId).all()
  for (const { folderId } of allFolderIds) {
    if (!folderId) continue
    const folderChats = db.select({ id: schema.chats.id, folderPosition: schema.chats.folderPosition })
      .from(schema.chats).where(eq(schema.chats.folderId, folderId))
      .orderBy(schema.chats.updatedAt).all()
    // Check if all positions are the same
    const allSame = folderChats.length > 1 && folderChats.every((c) => c.folderPosition === folderChats[0]!.folderPosition)
    if (!allSame) continue
    // Spread them out with incrementing keys
    let pos = "a0"
    for (const chat of folderChats) {
      db.update(schema.chats).set({ folderPosition: pos }).where(eq(schema.chats.id, chat.id)).run()
      // Simple increment: a0 -> a1 -> a2 etc.
      const lastChar = pos.charCodeAt(pos.length - 1)
      pos = pos.slice(0, -1) + String.fromCharCode(lastChar + 1)
    }
    console.log(`[DB] Spread ${folderChats.length} chat positions in folder ${folderId}`)
  }

  // Same for sub_chats: spread positions within each parent chat
  const allChatIds = db.select({ chatId: schema.subChats.chatId }).from(schema.subChats).groupBy(schema.subChats.chatId).all()
  for (const { chatId } of allChatIds) {
    if (!chatId) continue
    const subs = db.select({ id: schema.subChats.id, position: schema.subChats.position })
      .from(schema.subChats).where(eq(schema.subChats.chatId, chatId))
      .orderBy(schema.subChats.createdAt).all()
    const allSame = subs.length > 1 && subs.every((s) => s.position === subs[0]!.position)
    if (!allSame) continue
    let pos = "a0"
    for (const sub of subs) {
      db.update(schema.subChats).set({ position: pos }).where(eq(schema.subChats.id, sub.id)).run()
      const lastChar = pos.charCodeAt(pos.length - 1)
      pos = pos.slice(0, -1) + String.fromCharCode(lastChar + 1)
    }
    console.log(`[DB] Spread ${subs.length} sub-chat positions in chat ${chatId}`)
  }
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase()
  }
  return db
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
    console.log("[DB] Database connection closed")
  }
}

// Re-export schema for convenience
export * from "./schema"
