
import prisma from "../config/prisma.js";
export const getLocations = async (req,res)=>{

 const locations = await prisma.priceByLocation.findMany({
   orderBy:{
      location:"asc"
   }
 })

 res.json(locations)

}
export const createLocationPrice = async (req, res) => {
  try {
    const { location, price } = req.body;

    if (!location || price == null) {
      return res.status(400).json({
        message: "Location and price are required.",
      });
    }

    // Check if location already exists
    const existing = await prisma.priceByLocation.findUnique({
      where: {
        location,
      },
    });

    if (existing) {
      return res.status(400).json({
        message: "Location already exists.",
      });
    }

    const locationPrice = await prisma.priceByLocation.create({
      data: {
        location,
        price: Number(price),
      },
    });

    res.status(201).json({
      message: "Location price created successfully.",
      locationPrice,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error",
    });
  }
};

export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        message: "lat and lon are required",
      });
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "CargoShipon/1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Reverse geocoding failed");
    }

    const data = await response.json();

    return res.json({
      displayName: data.display_name,
      address: data.address,
    });
  } catch (error) {
    console.error("REVERSE GEOCODE ERROR:", error);

    return res.status(500).json({
      message: "Unable to determine location",
    });
  }
};