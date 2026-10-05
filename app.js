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
  if (event.key === 'Escape' && !modal.hidden) closeModal();
});

bookingForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) return;
  const name = document.querySelector('#fullName').value.trim().split(/\s+/)[0];
  const order = updateOrder();
  document.querySelector('#confirmationMessage').textContent = `Thanks, ${name}! Your Reptasia Halloween Night tickets are reserved. ${order.lines.join('. ')}. Total: ${currency.format(order.total)}. Your e-ticket details are on the way.`;
  document.querySelector('#checkoutFormView').hidden = true;
  document.querySelector('#confirmationView').hidden = false;
  document.querySelector('#doneButton').focus();
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
