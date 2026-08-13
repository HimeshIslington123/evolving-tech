/*
  Warnings:

  - You are about to drop the column `currentLocation` on the `Shipment` table. All the data in the column will be lost.
  - Added the required column `priceLocationId` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Made the column `codAmount` on table `Shipment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "currentLocation",
ADD COLUMN     "paymentType" "PaymentType" NOT NULL DEFAULT 'PREPAID',
ADD COLUMN     "priceLocationId" INTEGER NOT NULL,
ALTER COLUMN "codAmount" SET NOT NULL,
ALTER COLUMN "codAmount" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "PriceByLocation" (
    "id" SERIAL NOT NULL,
    "location" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceByLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceByLocation_location_key" ON "PriceByLocation"("location");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_priceLocationId_fkey" FOREIGN KEY ("priceLocationId") REFERENCES "PriceByLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
