-- DropForeignKey
ALTER TABLE "Vendor" DROP CONSTRAINT "Vendor_userId_fkey";

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "totalBox" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "warehouseId" INTEGER;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "isRegistered" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Staff_warehouseId_idx" ON "Staff"("warehouseId");

-- CreateIndex
CREATE INDEX "Vendor_isRegistered_idx" ON "Vendor"("isRegistered");

-- CreateIndex
CREATE INDEX "Warehouse_city_idx" ON "Warehouse"("city");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
