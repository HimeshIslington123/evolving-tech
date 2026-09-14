-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "returnDeliveryRiderId" INTEGER;

-- CreateIndex
CREATE INDEX "ReturnRequest_returnDeliveryRiderId_idx" ON "ReturnRequest"("returnDeliveryRiderId");

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_returnDeliveryRiderId_fkey" FOREIGN KEY ("returnDeliveryRiderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
