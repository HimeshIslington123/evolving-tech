-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'SCOOTER', 'CAR', 'VAN', 'TRUCK', 'BICYCLE', 'OTHER');

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "vehicleBrand" TEXT,
ADD COLUMN     "vehicleModel" TEXT,
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehicleType" "VehicleType";
