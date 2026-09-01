-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Pickup" (
    "id" SERIAL NOT NULL,
    "totalPackages" INTEGER NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupPhone" TEXT NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "vendorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pickup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
