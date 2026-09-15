-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "senderAddress" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderPhone" TEXT;

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Shipment_locationRateId_idx" ON "Shipment"("locationRateId");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Tracking_status_idx" ON "Tracking"("status");
