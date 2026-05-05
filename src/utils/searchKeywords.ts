/**
 * Normalizes Vietnamese text for Firestore teacher search (stored keywords + queries).
 * Must match Student "Find Teacher" query normalization.
 */
export function normalizeTeacherSearchInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\u0111\u0110]/g, "d") // \u0111 is not decomposed by NFD \u2014 must replace explicitly
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Builds `searchKeywords` for MOD/teacher Firestore docs: strip diacritics (Unicode NFD path),
 * lowercase, include full normalized phrases, word tokens (length ≥ 2),
 * normalized email/local parts, phone variants and consecutive digit prefixes.
 */
export function generateSearchKeywords(
  fullName: string,
  email: string,
  phoneNumber?: string
): string[] {
  const keywords = new Set<string>();

  const addFromText = (text: string) => {
    const norm = normalizeTeacherSearchInput(text);
    if (norm.length >= 2) keywords.add(norm);
    norm.split(/\s+/).forEach((t) => {
      if (t.length >= 2) keywords.add(t);
    });
  };

  addFromText(fullName);

  const em = email.trim().toLowerCase();
  if (em) {
    keywords.add(em);
    const local = em.split("@")[0] ?? "";
    if (local.length >= 2) keywords.add(normalizeTeacherSearchInput(local));
  }

  const phone = phoneNumber?.trim() ?? "";
  if (phone) {
    keywords.add(normalizeTeacherSearchInput(phone));
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 2) {
      keywords.add(digits);
      for (let len = 2; len <= digits.length; len++) {
        keywords.add(digits.slice(0, len));
      }
    }
  }

  return Array.from(keywords);
}
