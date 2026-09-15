import prisma from "../src/config/prisma.js";

async function main() {
  console.log("======================================");
  console.log("SHIPMENT SENDER BACKFILL");
  console.log("======================================");

  const shipments = await prisma.shipment.findMany({
    where: {
      OR: [
        { senderName: null },
        { senderPhone: null },
        { senderAddress: null },
      ],
    },
    include: {
      vendor: true,
    },
  });

  console.log(
    `Found ${shipments.length} shipment(s) requiring sender data.`
  );

  let updated = 0;
  let skipped = 0;

  for (const shipment of shipments) {
    // ==============================================
    // REGISTERED VENDOR
    // ==============================================

    if (shipment.vendor) {
      await prisma.shipment.update({
        where: {
          id: shipment.id,
        },

        data: {
          senderName:
            shipment.vendor.companyName ||
            "Unknown Sender",

          senderPhone:
            shipment.vendor.contactId ||
            "Unknown",

          senderAddress:
            shipment.vendor.location ||
            "Unknown",
        },
      });

      console.log(
        `✓ Updated ${shipment.trackingNumber} from vendor ${shipment.vendor.companyName}`
      );

      updated++;
      continue;
    }

    // ==============================================
    // WALK-IN / OLD SHIPMENT WITHOUT VENDOR
    // ==============================================

    console.log(
      `⚠ Skipped ${shipment.trackingNumber} because vendorId is null.`
    );

    skipped++;
  }

  console.log("======================================");
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log("======================================");

  if (skipped > 0) {
    console.log(
      "Some old walk-in shipments still need sender information."
    );
    console.log(
      "Open Prisma Studio and manually fill their sender fields."
    );
  }
}

main()
  .catch((error) => {
    console.error("BACKFILL ERROR:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });