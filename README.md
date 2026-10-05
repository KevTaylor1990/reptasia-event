# Reptasia Halloween Tickets

Responsive ticket-booking website for Reptasia Reptiles. Ticket confirmations are sent to buyers by email from a small Node.js server.

## Run locally

1. Install Node.js 20 or newer.
2. In this directory, run `npm install`.
3. Copy `.env.example` to `.env` and enter the SMTP host, port, username, password, and a sender address verified with your email provider.
4. Run `npm start` and open `http://localhost:3000`.

The `.env` file contains private mail credentials; keep it out of Git and never paste the credentials into chat. For production, deploy this Node.js app to a host that supports Node, configure the same environment variables in that host's secret settings, and use a verified sender domain/provider. Mount persistent storage for `BOOKINGS_FILE` and run a single app instance so the daily capacity cannot reset or be double-booked; use a transactional shared database if you need multiple instances.

If SMTP is not configured or delivery fails, checkout reports the issue instead of falsely claiming tickets were sent. The server recalculates prices, limits booking requests, and sends the buyer an itemized confirmation with a booking reference and event details.

## Ticket prices

- Under 2s: free
- Child (ages 3–16): £20
- Adult: £15
- Family ticket (2 adults + 2 children): £60

The booking page lists Thursday 29 October or Friday 30 October 2026, 6–8 PM, with a limit of 60 people per night. Under-2 tickets are free but use one space per child; each family ticket uses four spaces. Availability is checked and reserved on the server for the selected night.