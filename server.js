require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const nodemailer = require('nodemailer');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const DAILY_CAPACITY = 60;
const BOOKINGS_FILE = path.resolve(ROOT, process.env.BOOKINGS_FILE || 'data/bookings.json');
const EVENT_ADDRESS = 'Reptasia Reptiles, 34-36 Peabody Rd, North Camp, Farnborough, GU14 6EY';
const EVENT_DAYS = {
  '2026-10-29': { name: 'Thursday, 29 October 2026', schedule: 'Thursday 29 October 2026, 6:00–8:00 PM' },
  '2026-10-30': { name: 'Friday, 30 October 2026', schedule: 'Friday 30 October 2026, 6:00–8:00 PM' }
};
const TICKETS = {
  under2: { name: 'Under 2s', detail: 'Free entry for children under 2', price: 0, attendees: 1 },
  child: { name: 'Child (ages 3–16)', detail: 'Halloween event admission', price: 20, attendees: 1 },
  adult: { name: 'Adult', detail: 'Halloween event admission', price: 15, attendees: 1 },
  family: { name: 'Family ticket (2 adults + 2 children)', detail: 'Admits 2 adults and 2 children', price: 60, attendees: 4 }
};
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/background.css', ['background.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/862dda87-c7b8-43db-bf33-3e3c8d8174cc.png', ['862dda87-c7b8-43db-bf33-3e3c8d8174cc.png', 'image/png']],
  ['/IMG-20261004-WA0000.jpg', ['IMG-20261004-WA0000.jpg', 'image/jpeg']]
]);
const rateLimits = new Map();
let bookingQueue = Promise.resolve();

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

function withBookingLock(operation) {
  const result = bookingQueue.then(operation, operation);
  bookingQueue = result.catch(() => {});
  return result;
}

async function loadReservations() {
  try {
    const data = JSON.parse(await fs.readFile(BOOKINGS_FILE, 'utf8'));
    if (!Array.isArray(data) || data.some((reservation) => !EVENT_DAYS[reservation.eventDate]
      || !Number.isInteger(reservation.spaces) || reservation.spaces < 1)) {
      throw new Error('Booking inventory data has an invalid format.');
    }
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveReservations(reservations) {
  await fs.mkdir(path.dirname(BOOKINGS_FILE), { recursive: true });
  const temporaryFile = `${BOOKINGS_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(reservations, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporaryFile, BOOKINGS_FILE);
}

function getDayAvailability(reservations) {
  return Object.fromEntries(Object.entries(EVENT_DAYS).map(([eventDate, day]) => {
    const booked = reservations
      .filter((reservation) => reservation.eventDate === eventDate)
      .reduce((total, reservation) => total + reservation.spaces, 0);
    return [eventDate, {
      name: day.name,
      capacity: DAILY_CAPACITY,
      spacesRemaining: Math.max(0, DAILY_CAPACITY - booked)
    }];
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function checkRateLimit(request) {
  const address = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const current = rateLimits.get(address);
  if (!current || current.resetAt <= now) {
    rateLimits.set(address, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error('Booking request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Please check your booking details and try again.'), { status: 400 });
  }
}

function createOrder(tickets) {
  if (!Array.isArray(tickets) || tickets.length === 0 || tickets.length > Object.keys(TICKETS).length) {
    throw Object.assign(new Error('Please select at least one ticket.'), { status: 400 });
  }

  const seen = new Set();
  const lines = tickets.map((item) => {
    if (!item || !Object.hasOwn(TICKETS, item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > DAILY_CAPACITY || seen.has(item.id)) {
      throw Object.assign(new Error('One or more ticket quantities are invalid. Please review your order.'), { status: 400 });
    }
    seen.add(item.id);
    const ticket = TICKETS[item.id];
    return { ...ticket, quantity: item.quantity, lineTotal: ticket.price * item.quantity };
  });

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    attendees: lines.reduce((sum, line) => sum + line.quantity * line.attendees, 0)
  };
}

function formatGBP(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

function makeEmail(name, reference, order, eventDay) {
  const rowsText = order.lines.map((line) => `• ${line.quantity} × ${line.name} — ${formatGBP(line.lineTotal)}`).join('\n');
  const rowsHtml = order.lines.map((line) => `<tr><td style="padding:10px 8px;border-bottom:1px solid #e6e4dc">${line.quantity} × ${escapeHtml(line.name)}<br><small>${escapeHtml(line.detail)}</small></td><td style="padding:10px 8px;border-bottom:1px solid #e6e4dc;text-align:right;white-space:nowrap">${formatGBP(line.lineTotal)}</td></tr>`).join('');
  const safeName = escapeHtml(name);
  const safeReference = escapeHtml(reference);

  return {
    subject: `Your Reptasia Halloween tickets · ${reference}`,
    text: `Hi ${name},\n\nYour tickets for Reptasia Halloween Night are confirmed. Keep this email as your booking confirmation.\n\nBooking reference: ${reference}\n\n${rowsText}\n\nTotal: ${formatGBP(order.total)}\nPeople in booking: ${order.attendees}\n\nEvent: ${eventDay.schedule}\nVenue: ${EVENT_ADDRESS}\n\nPlease show this email to the Reptasia team when you arrive. If you have any questions, reply to this email.\n\nSee you there,\nReptasia Reptiles`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f8f7f3;color:#20221d;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:30px;background:#fffefa;border:1px solid #e6e4dc"><p style="color:#d84d30;font-size:12px;font-weight:bold;letter-spacing:2px">REPTASIA REPTILES</p><h1 style="font-size:28px">Your Halloween tickets are confirmed</h1><p>Hi ${safeName}, keep this email as your booking confirmation and show it to the Reptasia team when you arrive.</p><p style="padding:12px;background:#f1efe9"><strong>Booking reference:</strong> ${safeReference}</p><table style="width:100%;border-collapse:collapse"><tbody>${rowsHtml}</tbody><tfoot><tr><td style="padding:14px 8px"><strong>Total</strong></td><td style="padding:14px 8px;text-align:right"><strong>${formatGBP(order.total)}</strong></td></tr></tfoot></table><p><strong>People in booking:</strong> ${order.attendees}</p><h2 style="font-size:18px;margin-top:26px">Event details</h2><p><strong>${escapeHtml(eventDay.schedule)}</strong><br>${EVENT_ADDRESS}</p><p style="color:#74766d;font-size:13px">If you have any questions, reply to this email. We look forward to seeing you!</p><p style="margin-top:26px">— Reptasia Reptiles</p></main></body></html>`
  };
}

function buildTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !process.env.EMAIL_FROM) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/availability' && request.method === 'GET') {
    try {
      const days = await withBookingLock(async () => getDayAvailability(await loadReservations()));
      return json(response, 200, { days });
    } catch (error) {
      console.error('Could not load ticket availability:', error.message);
      return json(response, 503, { error: 'Live ticket availability is temporarily unavailable.' });
    }
  }

  if (requestUrl.pathname === '/api/bookings' && request.method === 'POST') {
    if (!checkRateLimit(request)) return json(response, 429, { error: 'Too many booking attempts. Please wait a little and try again.' });
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return json(response, 415, { error: 'Please submit your booking using the website form.' });
    }

    try {
      const body = await readJson(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (name.length < 2 || name.length > 100) throw Object.assign(new Error('Enter your full name (up to 100 characters).'), { status: 400 });
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address for ticket delivery.'), { status: 400 });
      const eventDay = EVENT_DAYS[body.eventDate];
      if (!eventDay) throw Object.assign(new Error('Choose Thursday 29 October or Friday 30 October.'), { status: 400 });
      const order = createOrder(body.tickets);
      if (order.attendees > DAILY_CAPACITY) throw Object.assign(new Error(`A booking cannot use more than ${DAILY_CAPACITY} spaces.`), { status: 400 });
      const transporter = buildTransport();
      if (!transporter) return json(response, 503, { error: 'Ticket email is not configured yet. Please contact Reptasia Reptiles to complete your booking.' });

      const booking = await withBookingLock(async () => {
        const reservations = await loadReservations();
        const dayAvailability = getDayAvailability(reservations)[body.eventDate];
        if (order.attendees > dayAvailability.spacesRemaining) {
          throw Object.assign(new Error(`Only ${dayAvailability.spacesRemaining} spaces remain for ${eventDay.name}. Please reduce your order or choose the other night.`), {
            status: 409,
            spacesRemaining: dayAvailability.spacesRemaining
          });
        }

        const bookingReference = `RPT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const reservation = {
          bookingReference,
          eventDate: body.eventDate,
          spaces: order.attendees,
          createdAt: new Date().toISOString()
        };
        reservations.push(reservation);
        await saveReservations(reservations);

        try {
          const emailContent = makeEmail(name, bookingReference, order, eventDay);
          await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            replyTo: process.env.REPLY_TO || process.env.EMAIL_FROM,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html
          });
        } catch (error) {
          try {
            await saveReservations(reservations.filter((entry) => entry.bookingReference !== bookingReference));
          } catch (rollbackError) {
            console.error('Could not release spaces after email failure:', rollbackError.message);
          }
          throw error;
        }

        const spacesRemaining = getDayAvailability(reservations)[body.eventDate].spacesRemaining;
        return { bookingReference, spacesRemaining };
      });

      return json(response, 201, {
        ...booking,
        message: `Your ticket confirmation has been emailed to ${email}. ${booking.spacesRemaining} spaces remain for this night.`
      });
    } catch (error) {
      console.error('Booking email failed:', error.message);
      return json(response, error.status || 502, {
        error: error.status ? error.message : 'We could not reserve spaces or send your tickets right now. Please try again shortly.',
        ...(error.spacesRemaining === undefined ? {} : { spacesRemaining: error.spacesRemaining })
      });
    }
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST', 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Method not allowed');
  }

  const publicFile = PUBLIC_FILES.get(requestUrl.pathname);
  if (!publicFile) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }

  try {
    const filePath = path.join(ROOT, publicFile[0]);
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': publicFile[1],
      'Content-Length': content.length,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    return response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('The website could not be loaded.');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Reptasia website running at http://localhost:${PORT}`);
  if (!buildTransport()) console.warn('SMTP is not configured; ticket email booking will return an unavailable message.');
});
