/*
  Warnings:

  - Added the required column `direction` to the `VendorSettlement` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SettlementDirection" AS ENUM ('PAY_VENDOR', 'COLLECT_FROM_VENDOR');

-- AlterTable
ALTER TABLE "VendorSettlement" ADD COLUMN     "direction" "SettlementDirection" NOT NULL,
ADD COLUMN     "totalCredits" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalDebits" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "accountingEntryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettlementItem_accountingEntryId_idx" ON "SettlementItem"("accountingEntryId");

-- CreateIndex
CREATE INDEX "SettlementItem_settlementId_idx" ON "SettlementItem"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementItem_settlementId_accountingEntryId_key" ON "SettlementItem"("settlementId", "accountingEntryId");

-- CreateIndex
CREATE INDEX "VendorSettlement_direction_idx" ON "VendorSettlement"("direction");

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "VendorSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
