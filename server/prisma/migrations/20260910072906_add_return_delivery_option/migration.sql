-- CreateEnum
CREATE TYPE "ReturnDeliveryOption" AS ENUM ('VENDOR_PICKUP', 'DELIVER_TO_VENDOR');

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "deliveryOption" "ReturnDeliveryOption";

-- CreateIndex
CREATE INDEX "ReturnRequest_deliveryOption_idx" ON "ReturnRequest"("deliveryOption");
