/*
  Warnings:

  - The values [RECEIVED] on the enum `PickupStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PickupStatus_new" AS ENUM ('REQUESTED', 'ASSIGNED', 'PICKUP_DONE', 'CANCELLED');
ALTER TABLE "public"."Pickup" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Pickup" ALTER COLUMN "status" TYPE "PickupStatus_new" USING ("status"::text::"PickupStatus_new");
ALTER TYPE "PickupStatus" RENAME TO "PickupStatus_old";
ALTER TYPE "PickupStatus_new" RENAME TO "PickupStatus";
DROP TYPE "public"."PickupStatus_old";
ALTER TABLE "Pickup" ALTER COLUMN "status" SET DEFAULT 'REQUESTED';
COMMIT;

-- AlterTable
ALTER TABLE "Pickup" ADD COLUMN     "riderId" INTEGER;

-- CreateIndex
CREATE INDEX "Pickup_status_idx" ON "Pickup"("status");

-- CreateIndex
CREATE INDEX "Pickup_vendorId_idx" ON "Pickup"("vendorId");

-- CreateIndex
CREATE INDEX "Pickup_riderId_idx" ON "Pickup"("riderId");

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
