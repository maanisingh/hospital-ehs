/**
 * Authentication Routes
 * Login, Register, Password Reset, Token Refresh
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { isValidEmail, errorResponse, successResponse } = require('../utils/helpers');

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 'Email and password are required', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { hospital: true }
    });

    if (!user) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    if (!user.isActive) {
      return errorResponse(res, 'Account is inactive. Contact administrator.', 401);
    }

    // Check hospital status (if not superadmin)
    if (user.role !== 'SUPERADMIN' && user.hospital) {
      if (!user.hospital.isActive) {
        return errorResponse(res, 'Hospital is inactive. Contact administrator.', 401);
      }
      if (user.hospital.subscriptionExpiry && new Date(user.hospital.subscriptionExpiry) < new Date()) {
        return errorResponse(res, 'Hospital subscription has expired. Contact administrator.', 401);
      }
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role, hospitalId: user.hospitalId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return successResponse(res, {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hospitalId: user.hospitalId,
        hospital: user.hospital ? {
          id: user.hospital.id,
          organizationCode: user.hospital.organizationCode,
          businessName: user.hospital.businessName,
          logo: user.hospital.logo
        } : null
      }
    }, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Login failed', 500);
  }
});

// ═══════════════════════════════════════════════════════
// REFRESH TOKEN
// ═══════════════════════════════════════════════════════

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return errorResponse(res, 'Refresh token required', 400);
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return errorResponse(res, 'Invalid refresh token', 401);
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { hospital: true }
    });

    if (!user || !user.isActive) {
      return errorResponse(res, 'User not found or inactive', 401);
    }

    // Generate new tokens
    const token = jwt.sign(
      { userId: user.id, role: user.role, hospitalId: user.hospitalId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const newRefreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return successResponse(res, {
      token,
      refreshToken: newRefreshToken
    }, 'Token refreshed');
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return errorResponse(res, 'Invalid or expired refresh token', 401);
    }
    console.error('Token refresh error:', error);
    return errorResponse(res, 'Token refresh failed', 500);
  }
});

// ═══════════════════════════════════════════════════════
// GET CURRENT USER
// ═══════════════════════════════════════════════════════

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        hospital: {
          select: {
            id: true,
            organizationCode: true,
            businessName: true,
            logo: true,
            address: true,
            city: true,
            helplineNumber: true
          }
        },
        doctor: {
          include: {
            department: true
          }
        }
      }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        hospitalId: user.hospitalId,
        hospital: user.hospital,
        doctor: user.doctor,
        lastLogin: user.lastLogin
      }
    }, 'User retrieved');
  } catch (error) {
    console.error('Get user error:', error);
    return errorResponse(res, 'Failed to get user', 500);
  }
});

// ═══════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'Current and new passwords are required', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'New password must be at least 6 characters', 400);
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return errorResponse(res, 'Current password is incorrect', 401);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    return successResponse(res, {}, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse(res, 'Failed to change password', 500);
  }
});

// ═══════════════════════════════════════════════════════
// LOGOUT (Client-side token invalidation)
// ═══════════════════════════════════════════════════════

router.post('/logout', authenticate, async (req, res) => {
  // In a production system, you might want to:
  // 1. Add the token to a blacklist
  // 2. Update user's lastLogout timestamp
  // For now, client should just delete the token

  return successResponse(res, {}, 'Logged out successfully');
});

module.exports = router;
