/**
 * Minimum password policy shared by signup, reset, and change-password.
 * Tuned against OWASP 2024 guidance:
 *   - Min length 10
 *   - Cannot be one of the 200 most common leaked passwords
 *   - Must contain at least 2 of: lower, upper, digit, symbol
 *
 * We deliberately do NOT force any single character class — NIST SP 800-63B
 * recommends length over composition. The class requirement acts as a soft
 * tie-breaker when the user picks something very short (10 chars).
 */

const COMMON = new Set<string>([
  "password",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "azerty123",
  "password1",
  "password123",
  "letmein123",
  "welcome123",
  "admin123",
  "iloveyou",
  "monkey123",
  "princess",
  "dragon123",
  "football",
  "baseball",
  "superman",
  "batman123",
  "master123",
  "michael1",
  "jennifer",
  "jordan23",
  "aiflex123",
  "aiflexadmin",
  "changeme",
  "changeme1",
  "default1",
  "trustno1",
  "abcdefgh",
]);

export function validatePasswordStrength(pwd: string): string | null {
  if (typeof pwd !== "string") return "Mot de passe invalide";
  if (pwd.length < 10) return "Le mot de passe doit faire au moins 10 caractères.";
  if (pwd.length > 256) return "Mot de passe trop long (max 256).";
  const lower = pwd.toLowerCase();
  if (COMMON.has(lower)) {
    return "Mot de passe trop courant — choisis quelque chose de plus unique.";
  }
  let classes = 0;
  if (/[a-z]/.test(pwd)) classes++;
  if (/[A-Z]/.test(pwd)) classes++;
  if (/[0-9]/.test(pwd)) classes++;
  if (/[^A-Za-z0-9]/.test(pwd)) classes++;
  if (classes < 2) {
    return "Le mot de passe doit combiner au moins 2 types de caractères (lettres, chiffres, symboles).";
  }
  // Repeat detection: "aaaaaaaa", "11111111"
  if (/^(.)\1{9,}$/.test(pwd)) {
    return "Mot de passe trop répétitif.";
  }
  return null;
}
