export function isValidEmail(email) {
  // Standard, practical email format check — not RFC-perfect, but catches real mistakes
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
}