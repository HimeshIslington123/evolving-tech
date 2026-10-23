-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "warehouseId" INTEGER;

-- CreateIndex
CREATE INDEX "Vendor_warehouseId_idx" ON "Vendor"("warehouseId");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
