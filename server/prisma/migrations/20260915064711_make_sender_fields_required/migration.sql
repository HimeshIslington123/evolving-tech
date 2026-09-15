/*
  Warnings:

  - Made the column `senderAddress` on table `Shipment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `senderName` on table `Shipment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `senderPhone` on table `Shipment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Shipment" ALTER COLUMN "senderAddress" SET NOT NULL,
ALTER COLUMN "senderName" SET NOT NULL,
ALTER COLUMN "senderPhone" SET NOT NULL;
