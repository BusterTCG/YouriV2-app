-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "templateId" TEXT,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "assigneeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "dueAt" DATETIME,
    "doneAt" DATETIME,
    "doneByUserId" TEXT,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeKey", "createdAt", "dealId", "deletedAt", "description", "doneAt", "doneByUserId", "dueAt", "id", "label", "notes", "order", "status", "templateId", "updatedAt") SELECT "assigneeKey", "createdAt", "dealId", "deletedAt", "description", "doneAt", "doneByUserId", "dueAt", "id", "label", "notes", "order", "status", "templateId", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_dealId_status_order_idx" ON "Task"("dealId", "status", "order");
CREATE INDEX "Task_assigneeKey_status_deletedAt_idx" ON "Task"("assigneeKey", "status", "deletedAt");
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
