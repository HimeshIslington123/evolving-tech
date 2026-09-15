/*
  Warnings:

  - You are about to alter the column `price` on the `LocationRate` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `returnCharge` on the `ReturnRequest` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `shippingCharge` on the `Shipment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `codAmount` on the `Shipment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.

*/
-- CreateEnum
CREATE TYPE "ReturnChargeType" AS ENUM ('NO_CHARGE', 'CHARGE');

-- CreateEnum
CREATE TYPE "ReturnChargePayer" AS ENUM ('CUSTOMER', 'VENDOR', 'COMPANY');

-- CreateEnum
CREATE TYPE "CodCollectionStatus" AS ENUM ('PENDING', 'COLLECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountingEntryType" AS ENUM ('COD_COLLECTION', 'SHIPPING_CHARGE', 'RETURN_CHARGE', 'PICKUP_CHARGE', 'STORAGE_CHARGE', 'OTHER_CHARGE', 'REFUND', 'VENDOR_SETTLEMENT');

-- CreateEnum
CREATE TYPE "AccountingDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "LocationRate" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "chargeSetAt" TIMESTAMP(3),
ADD COLUMN     "chargeSetById" INTEGER,
ADD COLUMN     "returnChargePayer" "ReturnChargePayer",
ADD COLUMN     "returnChargeType" "ReturnChargeType",
ALTER COLUMN "returnCharge" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Shipment" ALTER COLUMN "shippingCharge" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "codAmount" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "CodCollection" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "riderId" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CodCollectionStatus" NOT NULL DEFAULT 'PENDING',
    "collectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "shipmentId" TEXT,
    "returnRequestId" TEXT,
    "type" "AccountingEntryType" NOT NULL,
    "direction" "AccountingDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSettlement" (
    "id" TEXT NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "totalCodAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalShippingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalReturnCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalOtherCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodCollection_shipmentId_key" ON "CodCollection"("shipmentId");

-- CreateIndex
CREATE INDEX "CodCollection_status_idx" ON "CodCollection"("status");

-- CreateIndex
CREATE INDEX "CodCollection_riderId_idx" ON "CodCollection"("riderId");

-- CreateIndex
CREATE INDEX "AccountingEntry_vendorId_idx" ON "AccountingEntry"("vendorId");

-- CreateIndex
CREATE INDEX "AccountingEntry_shipmentId_idx" ON "AccountingEntry"("shipmentId");

-- CreateIndex
CREATE INDEX "AccountingEntry_returnRequestId_idx" ON "AccountingEntry"("returnRequestId");

-- CreateIndex
CREATE INDEX "AccountingEntry_type_idx" ON "AccountingEntry"("type");

-- CreateIndex
CREATE INDEX "AccountingEntry_direction_idx" ON "AccountingEntry"("direction");

-- CreateIndex
CREATE INDEX "VendorSettlement_vendorId_idx" ON "VendorSettlement"("vendorId");

-- CreateIndex
CREATE INDEX "VendorSettlement_status_idx" ON "VendorSettlement"("status");

-- CreateIndex
CREATE INDEX "ReturnRequest_returnChargeType_idx" ON "ReturnRequest"("returnChargeType");

-- CreateIndex
CREATE INDEX "ReturnRequest_returnChargePayer_idx" ON "ReturnRequest"("returnChargePayer");

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_chargeSetById_fkey" FOREIGN KEY ("chargeSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSettlement" ADD CONSTRAINT "VendorSettlement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
