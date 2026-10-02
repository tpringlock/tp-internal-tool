/**
 * Vietnamese amount in words, in the style of TP's hand-made HSTT files:
 *   890505769 -> "Tám trăm chín mươi triệu, năm trăm linh lăm nghìn, bảy trăm sáu mươi chín đồng./."
 *
 * Groups (tỷ / triệu / nghìn) are separated by ", "; all-zero groups are
 * dropped; groups after the first are read in full ("không trăm tám mươi tám").
 * "lăm" is used after mươi / mười and also after "linh" (the original files
 * write "linh lăm"). Cases: docs/hstt/bang-chu-cases.json.
 */
const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const SCALES = ["", " nghìn", " triệu"];
const BILLION = 1_000_000_000;

function readGroup(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const words: string[] = [];
  if (full || h > 0) words.push(`${DIGITS[h]} trăm`);
  if (t === 0) {
    if (u > 0) words.push(words.length > 0 ? `linh ${u === 5 ? "lăm" : DIGITS[u]}` : DIGITS[u]);
  } else if (t === 1) {
    words.push(u === 0 ? "mười" : `mười ${u === 5 ? "lăm" : DIGITS[u]}`);
  } else {
    const unit = u === 0 ? "" : u === 1 ? " mốt" : u === 4 ? " tư" : u === 5 ? " lăm" : ` ${DIGITS[u]}`;
    words.push(`${DIGITS[t]} mươi${unit}`);
  }
  return words.join(" ");
}

/** The non-empty groups of n > 0, most significant first. */
function readParts(n: number, leading: boolean): string[] {
  const parts: string[] = [];
  if (n >= BILLION) {
    parts.push(`${readParts(Math.floor(n / BILLION), leading).join(", ")} tỷ`);
    n %= BILLION;
    leading = false;
  }
  for (let i = SCALES.length - 1; i >= 0; i--) {
    const group = Math.floor(n / 1000 ** i) % 1000;
    if (group === 0) continue;
    parts.push(readGroup(group, !leading) + SCALES[i]);
    leading = false;
  }
  return parts;
}

export function amountInWords(amount: number): string {
  if (!Number.isSafeInteger(amount)) throw new Error(`Số tiền không hợp lệ: ${amount}`);
  const body = amount === 0 ? "không" : readParts(Math.abs(amount), true).join(", ");
  const text = `${amount < 0 ? "âm " : ""}${body} đồng./.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
