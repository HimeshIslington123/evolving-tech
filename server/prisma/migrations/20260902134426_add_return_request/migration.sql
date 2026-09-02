/*
  Warnings:

  - The values [RETURNED] on the enum `ShipmentStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'ASSIGNED_TO_RIDER', 'PICKED_UP_FROM_CUSTOMER', 'IN_WAREHOUSE', 'OUT_FOR_RETURN', 'RETURNED_TO_VENDOR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('CUSTOMER_CHANGED_MIND', 'WRONG_PRODUCT', 'DAMAGED_PRODUCT', 'DEFECTIVE_PRODUCT', 'WRONG_SIZE', 'WRONG_COLOR', 'PRODUCT_NOT_AS_DESCRIBED', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "ShipmentStatus_new" AS ENUM ('CREATED', 'IN_WAREHOUSE', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
ALTER TABLE "public"."Shipment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Shipment" ALTER COLUMN "status" TYPE "ShipmentStatus_new" USING ("status"::text::"ShipmentStatus_new");
ALTER TABLE "Tracking" ALTER COLUMN "status" TYPE "ShipmentStatus_new" USING ("status"::text::"ShipmentStatus_new");
ALTER TYPE "ShipmentStatus" RENAME TO "ShipmentStatus_old";
ALTER TYPE "ShipmentStatus_new" RENAME TO "ShipmentStatus";
DROP TYPE "public"."ShipmentStatus_old";
ALTER TABLE "Shipment" ALTER COLUMN "status" SET DEFAULT 'CREATED';
COMMIT;

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "ReturnReason" NOT NULL,
    "description" TEXT,
    "riderId" INTEGER,
    "returnTrackingNumber" TEXT,
    "returnCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_shipmentId_key" ON "ReturnRequest"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_returnTrackingNumber_key" ON "ReturnRequest"("returnTrackingNumber");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");

-- CreateIndex
CREATE INDEX "ReturnRequest_riderId_idx" ON "ReturnRequest"("riderId");

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
