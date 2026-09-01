import prisma from "../config/prisma.js";

// ======================================================
// CREATE DELIVERY TYPE
// ======================================================

export const createDeliveryType = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Delivery type name is required",
      });
    }

    const existing = await prisma.deliveryType.findUnique({
      where: {
        name: name.trim(),
      },
    });

    if (existing) {
      return res.status(409).json({
        message: "Delivery type already exists",
      });
    }

    const deliveryType = await prisma.deliveryType.create({
      data: {
        name: name.trim(),
      },
    });

    return res.status(201).json({
      message: "Delivery type created successfully",
      deliveryType,
    });
  } catch (error) {
    console.error(
      "Create delivery type error:",
      error
    );

    return res.status(500).json({
      message: "Failed to create delivery type",
    });
  }
};

// ======================================================
// GET ALL
// ======================================================

export const getDeliveryTypes = async (req, res) => {
  try {
    const deliveryTypes =
      await prisma.deliveryType.findMany({
        include: {
          rates: {
            include: {
              location: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

    return res.status(200).json(deliveryTypes);
  } catch (error) {
    console.error(
      "Get delivery types error:",
      error
    );

    return res.status(500).json({
      message: "Failed to get delivery types",
    });
  }
};

// ======================================================
// GET BY ID
// ======================================================

export const getDeliveryTypeById = async (
  req,
  res
) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid delivery type ID",
      });
    }

    const deliveryType =
      await prisma.deliveryType.findUnique({
        where: {
          id,
        },
        include: {
          rates: {
            include: {
              location: true,
            },
          },
        },
      });

    if (!deliveryType) {
      return res.status(404).json({
        message: "Delivery type not found",
      });
    }

    return res.status(200).json(deliveryType);
  } catch (error) {
    console.error(
      "Get delivery type error:",
      error
    );

    return res.status(500).json({
      message: "Failed to get delivery type",
    });
  }
};

// ======================================================
// UPDATE
// ======================================================

export const updateDeliveryType = async (
  req,
  res
) => {
  try {
    const id = Number(req.params.id);

    const { name } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Invalid delivery type ID",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Delivery type name is required",
      });
    }

    const existing =
      await prisma.deliveryType.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      return res.status(404).json({
        message: "Delivery type not found",
      });
    }

    const duplicate =
      await prisma.deliveryType.findFirst({
        where: {
          name: name.trim(),
          NOT: {
            id,
          },
        },
      });

    if (duplicate) {
      return res.status(409).json({
        message:
          "Another delivery type already exists",
      });
    }

    const deliveryType =
      await prisma.deliveryType.update({
        where: {
          id,
        },
        data: {
          name: name.trim(),
        },
      });

    return res.status(200).json({
      message:
        "Delivery type updated successfully",
      deliveryType,
    });
  } catch (error) {
    console.error(
      "Update delivery type error:",
      error
    );

    return res.status(500).json({
      message: "Failed to update delivery type",
    });
  }
};

// ======================================================
// DELETE
// ======================================================

export const deleteDeliveryType = async (
  req,
  res
) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid delivery type ID",
      });
    }

    const existing =
      await prisma.deliveryType.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      return res.status(404).json({
        message: "Delivery type not found",
      });
    }

    await prisma.deliveryType.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      message:
        "Delivery type deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete delivery type error:",
      error
    );

    return res.status(500).json({
      message: "Failed to delete delivery type",
    });
  }
};