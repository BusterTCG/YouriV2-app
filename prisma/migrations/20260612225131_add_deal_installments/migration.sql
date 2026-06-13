-- CreateTable
CREATE TABLE "DealInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL,
    "dueDate" DATETIME,
    "paymentStatus" TEXT NOT NULL DEFAULT 'N_A',
    "paidAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DealInstallment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DealInstallment_dealId_idx" ON "DealInstallment"("dealId");
