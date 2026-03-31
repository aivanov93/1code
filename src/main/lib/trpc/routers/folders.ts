import { eq, and, asc, ne } from "drizzle-orm"
import { z } from "zod"
import { getDatabase, folders, chats } from "../../db"
import { UNCATEGORIZED_FOLDER_ID, ARCHIVED_FOLDER_ID } from "../../db/index"
import { generateKeyBetween } from "../../db/fractional-index"
import { publicProcedure, router } from "../index"

export const foldersRouter = router({
  list: publicProcedure.query(() => {
    const db = getDatabase()
    return db.select().from(folders).orderBy(asc(folders.position)).all()
  }),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      icon: z.string().default("folder"),
      color: z.string().default("#6b7280"),
    }))
    .mutation(({ input }) => {
      const db = getDatabase()
      // Insert before the Archived folder (last user folder position)
      const allFolders = db.select().from(folders).orderBy(asc(folders.position)).all()
      const archivedIdx = allFolders.findIndex((f) => f.id === ARCHIVED_FOLDER_ID)
      const beforeArchived = archivedIdx > 0 ? allFolders[archivedIdx - 1]!.position : null
      const archivedPos = allFolders[archivedIdx]?.position ?? null
      const position = generateKeyBetween(beforeArchived, archivedPos)

      return db.insert(folders).values({
        name: input.name,
        icon: input.icon,
        color: input.color,
        position,
        system: false,
      }).returning().get()
    }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
      collapsed: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const { id, ...updates } = input
      const folder = db.select().from(folders).where(eq(folders.id, id)).get()
      if (!folder) throw new Error("Folder not found")
      // Only allow renaming system folders, not deleting/icon/color changes
      const setValues: Record<string, unknown> = { updatedAt: new Date() }
      if (updates.name !== undefined) setValues.name = updates.name
      if (updates.collapsed !== undefined) setValues.collapsed = updates.collapsed
      if (!folder.system) {
        if (updates.icon !== undefined) setValues.icon = updates.icon
        if (updates.color !== undefined) setValues.color = updates.color
      }
      return db.update(folders).set(setValues).where(eq(folders.id, id)).returning().get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const folder = db.select().from(folders).where(eq(folders.id, input.id)).get()
      if (!folder) throw new Error("Folder not found")
      if (folder.system) throw new Error("Cannot delete system folder")
      // Move chats to Uncategorized
      db.update(chats)
        .set({ folderId: UNCATEGORIZED_FOLDER_ID, updatedAt: new Date() })
        .where(eq(chats.folderId, input.id))
        .run()
      return db.delete(folders).where(eq(folders.id, input.id)).returning().get()
    }),

  reorder: publicProcedure
    .input(z.object({
      id: z.string(),
      afterId: z.string().nullable(), // folder to place after (null = first position)
      beforeId: z.string().nullable(), // folder to place before (null = last position)
    }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const folder = db.select().from(folders).where(eq(folders.id, input.id)).get()
      if (!folder || folder.system) throw new Error("Cannot reorder system folder")

      const afterFolder = input.afterId
        ? db.select().from(folders).where(eq(folders.id, input.afterId)).get()
        : null
      const beforeFolder = input.beforeId
        ? db.select().from(folders).where(eq(folders.id, input.beforeId)).get()
        : null

      const position = generateKeyBetween(
        afterFolder?.position ?? null,
        beforeFolder?.position ?? null,
      )
      return db.update(folders).set({ position, updatedAt: new Date() })
        .where(eq(folders.id, input.id)).returning().get()
    }),

  toggleCollapse: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const folder = db.select().from(folders).where(eq(folders.id, input.id)).get()
      if (!folder) throw new Error("Folder not found")
      return db.update(folders).set({ collapsed: !folder.collapsed, updatedAt: new Date() })
        .where(eq(folders.id, input.id)).returning().get()
    }),
})
