import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import { z } from "zod";

// ======================================================
// GET MY PROFILE
// ======================================================

export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        vendor: true,
        rider: true,
        staff: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Never return password
    const {
      password,
      ...userWithoutPassword
    } = user;

    return res.status(200).json({
      message: "Profile fetched successfully",
      user: userWithoutPassword,
    });

  } catch (err) {
    console.error("GET PROFILE ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};


// ======================================================
// GET USER PROFILE BY ID
// ADMIN ONLY
// ======================================================

export const getUserById = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        vendor: true,
        rider: true,
        staff: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const {
      password,
      ...userWithoutPassword
    } = user;

    return res.status(200).json({
      message: "User profile fetched successfully",
      user: userWithoutPassword,
    });

  } catch (err) {
    console.error("GET USER ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};

// ======================================================
// GET ALL USERS EXCEPT ADMIN
// ADMIN ONLY
// ======================================================

export const getAllUsersExceptAdmin = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: {
          not: "ADMIN",
        },
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,

        vendor: true,
        rider: true,
        staff: true,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      users,
    });
  } catch (err) {
    console.error("GET ALL USERS ERROR:", err);

    return res.status(500).json({
      message: "Failed to get users",
    });
  }
};
// ======================================================
// UPDATE MY PROFILE
// ======================================================

export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const schema = z.object({
      name: z
        .string()
        .min(2, "Name must be at least 2 characters")
        .optional(),

      email: z
        .string()
        .email("Invalid email")
        .optional(),

      phone: z
        .string()
        .optional(),

      profilePicture: z
        .string()
        .nullable()
        .optional(),

      companyName: z
        .string()
        .optional(),

      contactId: z
        .string()
        .optional(),

      location: z
        .string()
        .optional(),
    });

    const validation = schema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      name,
      email,
      phone,
      profilePicture,
      companyName,
      contactId,
      location,
    } = validation.data;


    // ==================================================
    // CHECK EMAIL
    // ==================================================

    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: {
            id: userId,
          },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "Email already exists",
        });
      }
    }


    // ==================================================
    // GET CURRENT USER
    // ==================================================

    const currentUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        vendor: true,
        rider: true,
        staff: true,
      },
    });

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }


    // ==================================================
    // UPDATE USER
    // ==================================================

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        ...(name !== undefined && {
          name,
        }),

        ...(email !== undefined && {
          email,
        }),
      },
    });


    // ==================================================
    // UPDATE VENDOR
    // ==================================================

    if (currentUser.role === "VENDOR" && currentUser.vendor) {
      await prisma.vendor.update({
        where: {
          id: currentUser.vendor.id,
        },
        data: {
          ...(companyName !== undefined && {
            companyName,
          }),

          ...(contactId !== undefined && {
            contactId,
          }),

          ...(location !== undefined && {
            location,
          }),
        },
      });
    }


    // ==================================================
    // UPDATE RIDER
    // ==================================================

    if (currentUser.role === "RIDER" && currentUser.rider) {
      await prisma.rider.update({
        where: {
          id: currentUser.rider.id,
        },
        data: {
          ...(phone !== undefined && {
            phone,
          }),

          ...(profilePicture !== undefined && {
            profilePicture,
          }),
        },
      });
    }


    // ==================================================
    // UPDATE STAFF
    // ==================================================

    if (currentUser.role === "STAFF" && currentUser.staff) {
      await prisma.staff.update({
        where: {
          id: currentUser.staff.id,
        },
        data: {
          ...(phone !== undefined && {
            phone,
          }),

          ...(profilePicture !== undefined && {
            profilePicture,
          }),
        },
      });
    }


    // ==================================================
    // GET UPDATED PROFILE
    // ==================================================

    const updatedUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        vendor: true,
        rider: true,
        staff: true,
      },
    });

    const {
      password,
      ...userWithoutPassword
    } = updatedUser;

    return res.status(200).json({
      message: "Profile updated successfully",
      user: userWithoutPassword,
    });

  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};


// ======================================================
// CHANGE PASSWORD
// ======================================================

export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;

    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(
          /[A-Z]/,
          "Password must contain an uppercase letter"
        )
        .regex(
          /[a-z]/,
          "Password must contain a lowercase letter"
        )
        .regex(
          /[0-9]/,
          "Password must contain a number"
        )
        .regex(
          /[^A-Za-z0-9]/,
          "Password must contain a special character"
        ),
    });

    const validation = schema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      currentPassword,
      newPassword,
    } = validation.data;


    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }


    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!passwordMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }


    const hashedPassword = await bcrypt.hash(
      newPassword,
      10
    );


    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
      },
    });


    return res.status(200).json({
      message: "Password changed successfully",
    });

  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};


// ======================================================
// DELETE USER
// ADMIN ONLY
// ======================================================

export const deleteUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }


    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }


    // Prevent admin from deleting themselves
    if (
      req.user.id === userId
    ) {
      return res.status(400).json({
        message: "You cannot delete your own account",
      });
    }


    await prisma.user.delete({
      where: {
        id: userId,
      },
    });


    return res.status(200).json({
      message: "User deleted successfully",
    });

  } catch (err) {
    console.error("DELETE USER ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};


// ======================================================
// FREEZE / UNFREEZE USER
// ADMIN ONLY
// ======================================================

export const toggleUserFreeze = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }


    if (req.user.id === userId) {
      return res.status(400).json({
        message: "You cannot freeze your own account",
      });
    }


    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }


    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        isActive: !user.isActive,
      },
    });


    return res.status(200).json({
      message: updatedUser.isActive
        ? "User unfrozen successfully"
        : "User frozen successfully",

      isActive: updatedUser.isActive,
    });

  } catch (err) {
    console.error("FREEZE USER ERROR:", err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
};