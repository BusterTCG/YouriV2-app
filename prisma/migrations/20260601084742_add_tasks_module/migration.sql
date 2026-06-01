-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "defaultAssigneeKey" TEXT,
    "defaultDueOffsetDays" INTEGER,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
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
    CONSTRAINT "Task_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskTemplate_category_order_deletedAt_idx" ON "TaskTemplate"("category", "order", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_dealId_status_order_idx" ON "Task"("dealId", "status", "order");

-- CreateIndex
CREATE INDEX "Task_assigneeKey_status_deletedAt_idx" ON "Task"("assigneeKey", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");
