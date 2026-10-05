const selectedTicket = document.querySelector('.single-ticket');
const quantityOutput = document.querySelector('#quantity');
const totalPrice = document.querySelector('#totalPrice');
const modal = document.querySelector('#checkoutModal');
const bookingForm = document.querySelector('#bookingForm');
const menuToggle = document.querySelector('#menuToggle');
const mainNav = document.querySelector('.main-nav');

let quantity = 2;
let lastFocusedElement = null;

function updateOrder() {
  quantityOutput.textContent = quantity;
  const subtotal = Number(selectedTicket.dataset.price) * quantity;
  const fees = Math.ceil(subtotal * 0.08);
  totalPrice.textContent = `$${subtotal + fees}`;
}

document.querySelector('#decreaseQty').addEventListener('click', () => {
  if (quantity > 1) quantity -= 1;
  updateOrder();
});

document.querySelector('#increaseQty').addEventListener('click', () => {
  if (quantity < 8) quantity += 1;
  updateOrder();
});

document.querySelector('#checkoutButton').addEventListener('click', () => {
  lastFocusedElement = document.activeElement;
  const subtotal = Number(selectedTicket.dataset.price) * quantity;
  const total = totalPrice.textContent;
  document.querySelector('#modalSummary').innerHTML = `<strong>${quantity} × ${selectedTicket.dataset.ticket}</strong><br>Reptasia Halloween Night · Saturday, October 31 · Total ${total} (includes $${Number(total.slice(1)) - subtotal} booking fees)`;
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
  document.querySelector('#confirmationMessage').textContent = `Thanks, ${name}! Your order for ${quantity} entrance ticket${quantity === 1 ? '' : 's'} is reserved for Reptasia Halloween Night. Your e-ticket${quantity === 1 ? ' is' : 's are'} on the way.`;
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
