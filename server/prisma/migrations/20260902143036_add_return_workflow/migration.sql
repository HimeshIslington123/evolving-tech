/*
  Warnings:

  - You are about to drop the column `returnTrackingNumber` on the `ReturnRequest` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURN_REQUESTED';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURN_ASSIGNED_TO_RIDER';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURN_PICKED_UP_FROM_CUSTOMER';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURN_IN_WAREHOUSE';
ALTER TYPE "ShipmentStatus" ADD VALUE 'OUT_FOR_RETURN';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURNED_TO_VENDOR';

-- DropForeignKey
ALTER TABLE "LocationRate" DROP CONSTRAINT "LocationRate_deliveryTypeId_fkey";

-- DropForeignKey
ALTER TABLE "LocationRate" DROP CONSTRAINT "LocationRate_locationId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_shipmentId_fkey";

-- DropForeignKey
ALTER TABLE "Pickup" DROP CONSTRAINT "Pickup_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "ReturnRequest" DROP CONSTRAINT "ReturnRequest_shipmentId_fkey";

-- DropForeignKey
ALTER TABLE "Rider" DROP CONSTRAINT "Rider_userId_fkey";

-- DropForeignKey
ALTER TABLE "RiderLocation" DROP CONSTRAINT "RiderLocation_riderId_fkey";

-- DropForeignKey
ALTER TABLE "Staff" DROP CONSTRAINT "Staff_userId_fkey";

-- DropForeignKey
ALTER TABLE "Tracking" DROP CONSTRAINT "Tracking_shipmentId_fkey";

-- DropForeignKey
ALTER TABLE "Vendor" DROP CONSTRAINT "Vendor_userId_fkey";

-- DropIndex
DROP INDEX "ReturnRequest_returnTrackingNumber_key";

-- AlterTable
ALTER TABLE "ReturnRequest" DROP COLUMN "returnTrackingNumber";

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationRate" ADD CONSTRAINT "LocationRate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationRate" ADD CONSTRAINT "LocationRate_deliveryTypeId_fkey" FOREIGN KEY ("deliveryTypeId") REFERENCES "DeliveryType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracking" ADD CONSTRAINT "Tracking_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderLocation" ADD CONSTRAINT "RiderLocation_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
