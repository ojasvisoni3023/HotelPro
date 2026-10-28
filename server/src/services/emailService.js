import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Email delivery.
 * - SMTP configured  -> real delivery through Nodemailer.
 * - SMTP missing     -> the message is NOT sent. It is written to the server log and,
 *                       outside production, kept in an in-memory dev outbox
 *                       (GET /api/dev/outbox). Callers receive { delivered: false }.
 */
let transporter = null;
const outbox = [];
const OUTBOX_MAX = 50;

function getTransporter() {
  if (!config.smtp.configured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export function getDevOutbox() {
  return [...outbox].reverse();
}

export function clearDevOutbox() {
  outbox.length = 0;
}

export async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    const entry = { to, subject, text, at: new Date().toISOString() };
    if (!config.isProd) {
      outbox.push(entry);
      if (outbox.length > OUTBOX_MAX) outbox.shift();
    }
    logger.warn(`[email not sent — SMTP not configured] to=${to} subject="${subject}"`);
    if (!config.isProd && !config.isTest) logger.info(`[email body]\n${text}`);
    return { delivered: false, mode: 'log' };
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text, html });
    return { delivered: true, mode: 'smtp' };
  } catch (err) {
    logger.error('Email delivery failed', { to, subject, message: err.message });
    return { delivered: false, mode: 'smtp', error: err.message };
  }
}

/* ---------- templates ---------- */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f6f2ea;font-family:Helvetica,Arial,sans-serif;color:#1c2333">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1e33;padding:22px 28px;color:#e9d8b4;font-family:Georgia,serif;font-size:22px;letter-spacing:1px">HotelPro</td></tr>
  <tr><td style="padding:28px"><h2 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:normal;color:#0f1e33">${esc(title)}</h2>${bodyHtml}</td></tr>
  <tr><td style="padding:16px 28px;background:#faf7f0;color:#7a7466;font-size:12px">You received this email because of activity on your HotelPro account.</td></tr>
  </table></td></tr></table></body></html>`;
}

function button(url, label) {
  return `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#b8924a;color:#0f1e33;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${esc(label)}</a></p>
  <p style="font-size:12px;color:#7a7466">If the button does not work, copy this link:<br>${esc(url)}</p>`;
}

export const templates = {
  verifyEmail(user, url) {
    return {
      subject: 'Verify your HotelPro email address',
      text: `Hi ${user.name},\n\nConfirm your email address to start booking:\n${url}\n\nThis link expires in 24 hours.`,
      html: layout('Confirm your email', `<p>Hi ${esc(user.name)},</p><p>Confirm your email address to start booking with HotelPro.</p>${button(url, 'Verify email')}<p>This link expires in 24 hours.</p>`),
    };
  },
  resetPassword(user, url) {
    return {
      subject: 'Reset your HotelPro password',
      text: `Hi ${user.name},\n\nReset your password using this link (valid for 30 minutes):\n${url}\n\nIf you did not request this, ignore this email.`,
      html: layout('Reset your password', `<p>Hi ${esc(user.name)},</p><p>We received a request to reset your password.</p>${button(url, 'Choose a new password')}<p>The link is valid for 30 minutes. If you did not request this, you can ignore this email.</p>`),
    };
  },
  bookingConfirmed(booking, hotel, url) {
    const lines = `Confirmation: ${booking.confirmationCode}\nHotel: ${hotel.name}\nCheck-in: ${fmt(booking.checkIn)}\nCheck-out: ${fmt(booking.checkOut)}\nTotal paid: ${inr(booking.pricing.total)}`;
    return {
      subject: `Booking confirmed — ${hotel.name} (${booking.confirmationCode})`,
      text: `Your stay is confirmed.\n\n${lines}\n\nManage your booking: ${url}`,
      html: layout('Your stay is confirmed', `<p>Thank you, ${esc(booking.guestDetails.name)}.</p><pre style="font-family:inherit;background:#faf7f0;padding:14px;border-radius:8px">${esc(lines)}</pre>${button(url, 'View booking')}`),
    };
  },
  bookingCancelled(booking, hotel, refundAmount, url) {
    const refund = refundAmount > 0 ? `A refund of ${inr(refundAmount)} has been requested and will be processed to your original payment method.` : 'No refund applies to this cancellation.';
    return {
      subject: `Booking cancelled — ${booking.confirmationCode}`,
      text: `Your booking ${booking.confirmationCode} at ${hotel.name} has been cancelled.\n${refund}\n\n${url}`,
      html: layout('Booking cancelled', `<p>Your booking <strong>${esc(booking.confirmationCode)}</strong> at ${esc(hotel.name)} has been cancelled.</p><p>${esc(refund)}</p>${button(url, 'View booking')}`),
    };
  },
  paymentStatus(booking, status, amount, url) {
    const msg = {
      captured: `We received your payment of ${inr(amount)}.`,
      failed: 'Your payment did not go through. You can retry from your booking page while the reservation hold is active.',
      refunded: `Your refund of ${inr(amount)} has been processed.`,
    }[status];
    return {
      subject: `Payment update — ${booking.confirmationCode}`,
      text: `${msg}\n\n${url}`,
      html: layout('Payment update', `<p>${esc(msg)}</p>${button(url, 'View booking')}`),
    };
  },
  generic(title, message, url) {
    return {
      subject: title,
      text: `${message}${url ? `\n\n${url}` : ''}`,
      html: layout(title, `<p>${esc(message)}</p>${url ? button(url, 'Open HotelPro') : ''}`),
    };
  },
};

function fmt(d) {
  return new Date(d).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}
function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
