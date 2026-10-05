const totalPrice = document.querySelector('#totalPrice');
const modal = document.querySelector('#checkoutModal');
const bookingForm = document.querySelector('#bookingForm');
const menuToggle = document.querySelector('#menuToggle');
const mainNav = document.querySelector('.main-nav');
const ticketCards = [...document.querySelectorAll('.multi-ticket')];
const quantities = Object.fromEntries(ticketCards.map((card) => [card.dataset.ticketId, 0]));
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

let lastFocusedElement = null;

function updateOrder() {
  let total = 0;
  const lines = [];

  ticketCards.forEach((card) => {
    const id = card.dataset.ticketId;
    const quantity = quantities[id];
    const lineTotal = quantity * Number(card.dataset.price);
    total += lineTotal;
    document.querySelector(`#quantity-${id}`).textContent = quantity;
    if (quantity > 0) {
      lines.push(`${quantity} × ${card.dataset.ticket} — ${currency.format(lineTotal)}`);
    }
  });

  totalPrice.textContent = currency.format(total);
  document.querySelector('#orderSelection').textContent = lines.length ? lines.join(' · ') : 'No tickets selected yet.';
  document.querySelector('#checkoutButton').disabled = !Object.values(quantities).some((quantity) => quantity > 0);
  return { lines, total };
}

document.querySelectorAll('[data-quantity-change]').forEach((button) => {
  button.addEventListener('click', () => {
    const card = button.closest('.multi-ticket');
    const id = card.dataset.ticketId;
    const change = Number(button.dataset.quantityChange);
    quantities[id] = Math.max(0, Math.min(8, quantities[id] + change));
    updateOrder();
  });
});

document.querySelector('#checkoutButton').addEventListener('click', () => {
  lastFocusedElement = document.activeElement;
  const order = updateOrder();
  document.querySelector('#modalSummary').textContent = `${order.lines.join('\n')}\nReptasia Halloween Night · Thursday & Friday, October 29–30 · 6:00–8:00 PM\nTotal: ${currency.format(order.total)}`;
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
      tickets: order
    })
  })
    .then(async (response) => {
      const result = await response.json().catch(() => {
        throw new Error('Ticket email service could not be reached. Please open the hosted booking page or contact Reptasia Reptiles.');
      });
      if (!response.ok) throw new Error(result.error || 'We could not send your tickets. Please try again.');
      return result;
    })
    .then((result) => {
      document.querySelector('#confirmationMessage').textContent = `Your Reptasia Halloween Night booking ${result.bookingReference} is confirmed. ${result.message}`;
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
