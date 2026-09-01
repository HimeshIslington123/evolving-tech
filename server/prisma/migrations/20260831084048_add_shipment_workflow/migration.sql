/*
  Warnings:

  - The values [PENDING,RECEIVED,PROCESSING] on the enum `ShipmentStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `priceLocationId` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the `PriceByLocation` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `locationRateId` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `origin` to the `Shipment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ShipmentOrigin" AS ENUM ('VENDOR', 'STAFF');

-- CreateEnum
CREATE TYPE "DeliveryZone" AS ENUM ('INSIDE_VALLEY', 'OUTSIDE_VALLEY');

-- AlterEnum
BEGIN;
CREATE TYPE "ShipmentStatus_new" AS ENUM ('CREATED', 'IN_WAREHOUSE', 'READY_FOR_DISPATCH', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'CANCELLED');
ALTER TABLE "public"."Shipment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Shipment" ALTER COLUMN "status" TYPE "ShipmentStatus_new" USING ("status"::text::"ShipmentStatus_new");
ALTER TABLE "Tracking" ALTER COLUMN "status" TYPE "ShipmentStatus_new" USING ("status"::text::"ShipmentStatus_new");
ALTER TYPE "ShipmentStatus" RENAME TO "ShipmentStatus_old";
ALTER TYPE "ShipmentStatus_new" RENAME TO "ShipmentStatus";
DROP TYPE "public"."ShipmentStatus_old";
ALTER TABLE "Shipment" ALTER COLUMN "status" SET DEFAULT 'CREATED';
COMMIT;

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_priceLocationId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_vendorId_fkey";

-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "priceLocationId",
ADD COLUMN     "carrierId" INTEGER,
ADD COLUMN     "createdByStaffId" INTEGER,
ADD COLUMN     "deliveryZone" "DeliveryZone",
ADD COLUMN     "locationRateId" INTEGER NOT NULL,
ADD COLUMN     "origin" "ShipmentOrigin" NOT NULL,
ADD COLUMN     "warehouseId" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'CREATED',
ALTER COLUMN "vendorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tracking" ADD COLUMN     "createdBy" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "PriceByLocation";

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationRate" (
    "id" SERIAL NOT NULL,
    "locationId" INTEGER NOT NULL,
    "deliveryTypeId" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryType_name_key" ON "DeliveryType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LocationRate_locationId_deliveryTypeId_key" ON "LocationRate"("locationId", "deliveryTypeId");

-- CreateIndex
CREATE INDEX "Notification_shipmentId_idx" ON "Notification"("shipmentId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_vendorId_idx" ON "Shipment"("vendorId");

-- CreateIndex
CREATE INDEX "Shipment_riderId_idx" ON "Shipment"("riderId");

-- CreateIndex
CREATE INDEX "Shipment_warehouseId_idx" ON "Shipment"("warehouseId");

-- CreateIndex
CREATE INDEX "Shipment_carrierId_idx" ON "Shipment"("carrierId");

-- AddForeignKey
ALTER TABLE "LocationRate" ADD CONSTRAINT "LocationRate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationRate" ADD CONSTRAINT "LocationRate_deliveryTypeId_fkey" FOREIGN KEY ("deliveryTypeId") REFERENCES "DeliveryType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_locationRateId_fkey" FOREIGN KEY ("locationRateId") REFERENCES "LocationRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
