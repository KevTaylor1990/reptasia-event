const totalPrice = document.querySelector('#totalPrice');
const modal = document.querySelector('#checkoutModal');
const bookingForm = document.querySelector('#bookingForm');
const menuToggle = document.querySelector('#menuToggle');
const mainNav = document.querySelector('.main-nav');
const ticketCards = [...document.querySelectorAll('.multi-ticket')];
const eventDayInputs = [...document.querySelectorAll('input[name="eventDate"]')];
const quantities = Object.fromEntries(ticketCards.map((card) => [card.dataset.ticketId, 0]));
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

let lastFocusedElement = null;
let selectedEventDate = '';
let availability = {};
let availabilityLoaded = false;

const eventDates = {
  '2026-10-29': 'Thursday, 29 October 2026',
  '2026-10-30': 'Friday, 30 October 2026'
};

function renderAvailability() {
  eventDayInputs.forEach((input) => {
    const day = availability[input.value];
    const isFull = !day || day.spacesRemaining === 0;
    input.disabled = isFull;
    input.closest('.event-day-option').classList.toggle('selected', input.checked);
    input.closest('.event-day-option').classList.toggle('unavailable', isFull);
    document.querySelector(`#remaining-${input.value}`).textContent = !day
      ? 'Availability unavailable'
      : isFull
        ? 'Fully booked'
        : `${day.spacesRemaining} of 60 spaces left`;
  });
}

function updateOrder() {
  let total = 0;
  const attendees = ticketCards.reduce((count, card) => (
    count + quantities[card.dataset.ticketId] * Number(card.dataset.attendees)
  ), 0);
  const lines = [];

  ticketCards.forEach((card) => {
    const id = card.dataset.ticketId;
    const quantity = quantities[id];
    const lineTotal = quantity * Number(card.dataset.price);
    total += lineTotal;
    document.querySelector(`#quantity-${id}`).textContent = quantity;
    card.querySelector('[data-quantity-change="-1"]').disabled = quantity === 0;
    card.querySelector('[data-quantity-change="1"]').disabled = quantity >= 60
      || !selectedEventDate
      || !availability[selectedEventDate]
      || attendees + Number(card.dataset.attendees) > availability[selectedEventDate].spacesRemaining;
    if (quantity > 0) {
      lines.push(`${quantity} × ${card.dataset.ticket} — ${currency.format(lineTotal)}`);
    }
  });

  totalPrice.textContent = currency.format(total);
  document.querySelector('#orderSelection').textContent = lines.length ? lines.join(' · ') : 'No tickets selected yet.';
  const remaining = availability[selectedEventDate]?.spacesRemaining;
  const capacityMessage = document.querySelector('#capacityMessage');
  if (!availabilityLoaded) {
    capacityMessage.textContent = 'Checking remaining spaces…';
  } else if (selectedEventDate && remaining === 0) {
    capacityMessage.textContent = 'This night is fully booked. Please choose the other event night.';
  } else if (selectedEventDate && remaining !== undefined) {
    capacityMessage.textContent = `${remaining} ${remaining === 1 ? 'space' : 'spaces'} remaining for this night. Each person, including children under 2, uses one space; a family ticket uses four.`;
  } else if (availabilityLoaded) {
    capacityMessage.textContent = 'Select an event day to check availability and choose tickets.';
  }

  document.querySelector('#checkoutButton').disabled = !availabilityLoaded
    || !selectedEventDate
    || attendees === 0
    || remaining === undefined
    || attendees > remaining;
  return { lines, total, attendees, remaining };
}

eventDayInputs.forEach((input) => {
  input.addEventListener('change', () => {
    selectedEventDate = input.value;
    eventDayInputs.forEach((dayInput) => dayInput.closest('.event-day-option').classList.toggle('selected', dayInput.checked));
    document.querySelector('#orderDate').textContent = `${eventDates[selectedEventDate]} · 6–8 PM · Reptasia Reptiles`;
    document.querySelector('#bookingStatus').hidden = true;
    updateOrder();
  });
});

async function loadAvailability() {
  const capacityMessage = document.querySelector('#capacityMessage');
  try {
    const response = await fetch('/api/availability', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Availability could not be loaded.');
    availability = result.days;
    availabilityLoaded = true;
    renderAvailability();
    updateOrder();
  } catch {
    availabilityLoaded = false;
    capacityMessage.textContent = 'Live availability is unavailable. Please refresh or contact Reptasia Reptiles.';
    document.querySelector('#checkoutButton').disabled = true;
  }
}

document.querySelectorAll('[data-quantity-change]').forEach((button) => {
  button.addEventListener('click', () => {
    const card = button.closest('.multi-ticket');
    const id = card.dataset.ticketId;
    const change = Number(button.dataset.quantityChange);
    quantities[id] = Math.max(0, Math.min(60, quantities[id] + change));
    updateOrder();
  });
});

document.querySelector('#checkoutButton').addEventListener('click', () => {
  lastFocusedElement = document.activeElement;
  const order = updateOrder();
  document.querySelector('#modalSummary').textContent = `${eventDates[selectedEventDate]} · 6:00–8:00 PM\n${order.lines.join('\n')}\n${order.attendees} of 60 spaces · Total: ${currency.format(order.total)}`;
  document.querySelector('#checkoutFormView').hidden = false;
  document.querySelector('#confirmationView').hidden = true;
  document.querySelector('#bookingStatus').hidden = true;
  modal.hidden = false;
  document.querySelector('#fullName').focus();
});

function closeModal() {
  modal.hidden = true;
  if (lastFocusedElement) lastFocusedElement.focus();
}

document.querySelector('#closeModal').addEventListener('click', closeModal);
document.querySelector('#doneButton').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (modal.hidden) return;
  if (event.key === 'Escape') {
    closeModal();
    return;
  }

  if (event.key === 'Tab') {
    const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

bookingForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) return;
  const submitButton = document.querySelector('#placeBookingButton');
  const status = document.querySelector('#bookingStatus');
  const order = ticketCards
    .filter((card) => quantities[card.dataset.ticketId] > 0)
    .map((card) => ({ id: card.dataset.ticketId, quantity: quantities[card.dataset.ticketId] }));

  submitButton.disabled = true;
  submitButton.firstChild.textContent = 'Sending your tickets… ';
  status.hidden = true;

  fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.querySelector('#fullName').value.trim(),
      email: document.querySelector('#email').value.trim(),
      eventDate: selectedEventDate,
      tickets: order
    })
  })
    .then(async (response) => {
      const result = await response.json().catch(() => {
        throw new Error('Ticket email service could not be reached. Please open the hosted booking page or contact Reptasia Reptiles.');
      });
      if (!response.ok) {
        if (response.status === 409 && Number.isInteger(result.spacesRemaining)) {
          availability[selectedEventDate].spacesRemaining = result.spacesRemaining;
          renderAvailability();
          updateOrder();
        }
        throw new Error(result.error || 'We could not send your tickets. Please try again.');
      }
      return result;
    })
    .then((result) => {
      const bookedEventDate = selectedEventDate;
      availability[bookedEventDate].spacesRemaining = result.spacesRemaining;
      Object.keys(quantities).forEach((id) => { quantities[id] = 0; });
      selectedEventDate = '';
      eventDayInputs.forEach((input) => { input.checked = false; });
      document.querySelector('#orderDate').textContent = 'Choose a day · 6–8 PM · Reptasia Reptiles';
      renderAvailability();
      updateOrder();
      document.querySelector('#confirmationMessage').textContent = `Your Reptasia Halloween Night booking ${result.bookingReference} for ${eventDates[bookedEventDate]} is confirmed. ${result.message}`;
      document.querySelector('#checkoutFormView').hidden = true;
      document.querySelector('#confirmationView').hidden = false;
      document.querySelector('#doneButton').focus();
    })
    .catch((error) => {
      status.textContent = error.message === 'Failed to fetch'
        ? 'Ticket email is not available right now. Please try again in a moment.'
        : error.message;
      status.hidden = false;
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.firstChild.textContent = 'Email my tickets ';
    });
});

menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

mainNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
  });
});

updateOrder();
loadAvailability();
