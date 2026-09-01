export const adminOnly = (req, res, next) => {

  // authenticate must run first
  if (!req.user) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  // Check role
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  next();
};