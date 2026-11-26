import { createWorker } from "tesseract.js";
import type { Category, ExpenseInput, ExpenseItem } from "./types";

function guessCategory(text: string): Category | undefined {
  const value = text.toLowerCase();
  if (/grocery|groceries|supermarket|hypermarket|carrefour|lulu|spinneys|choithram|nesto|union coop|waitrose|viva supermarket|zoom market|grandiose|west zone|al maya|geant|kibsons|baqer mohebi|amazon fresh|market/.test(value)) return "Groceries";
  if (/cinema|movie|vox|reel cinemas|netflix|spotify|playstation|xbox|theatre|concert|theme park|entertainment|yas waterworld|motiongate/.test(value)) return "Entertainment";
  if (/pharmacy|chemist|clinic|hospital|medical|doctor|dental|aster|life pharmacy|boots pharmacy|supercare|medcare|mediclinic|nmc hospital|binsina/.test(value)) return "Health & pharmacy";
  if (/adnoc|enoc|petrol|gas station|fuel|uber|lyft|taxi|careem ride|metro|rta|salik|parking|transport/.test(value)) return "Transport & fuel";
  if (/dewa|addc|sewa|empower|utility|electricity|water bill|rent|home maintenance|furniture/.test(value)) return "Home & utilities";
  if (/etisalat|e& telecom|telecom|mobile bill|internet bill|broadband|du bill/.test(value)) return "Telecom & internet";
  if (/hotel|airline|flight|airways|airport|travel|booking\\.com|airbnb|holiday/.test(value)) return "Travel & accommodation";
  if (/school|university|tuition|education|course|books|training/.test(value)) return "Education";
  if (/salon|barber|beauty|cosmetic|personal care|spa|haircut/.test(value)) return "Personal care";
  if (/gym|fitness|wellness|sports club|yoga|sportswear/.test(value)) return "Fitness & wellness";
  if (/restaurant|cafe|coffee|bakery|food|dining|talabat|deliveroo|mcdonald|starbucks|kfc|pizza/.test(value)) return "Dining & cafes";
  if (/amazon|noon|mall|retail|fashion|clothing|electronics|shop|store|ikea|lifestyle/.test(value)) return "Shopping & retail";
  if (/government|municipality|visa fee|fine|license fee|court fee/.test(value)) return "Government & fees";
  if (/charity|donation|gift|florist/.test(value)) return "Gifts & donations";
  if (/pet shop|veterinary|vet clinic|pet food/.test(value)) return "Pets";
  if (/insurance|premium/.test(value)) return "Insurance";
  return undefined;
}

function parseLineItems(lines: string[], merchantCategory: Category): ExpenseItem[] {
  const items: ExpenseItem[] = [];
  const priceAtEnd = /(?:\bAED\b|د\.?\s*إ)?\s*((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:[.,][0-9]{1,2})?)\s*$/i;
  const excludedLine = /\b(total|subtotal|sub-total|tax|vat|discount|change|cash|visa|mastercard|credit|debit|balance|amount due|invoice|receipt|date|time|thank you|tender|rounding|service charge)\b/i;

  for (const line of lines) {
    if (excludedLine.test(line)) continue;
    const match = line.match(priceAtEnd);
    if (!match || match.index === undefined) continue;
    const description = line.slice(0, match.index).replace(/[\s*×x-]+$/, "").trim();
    const rawAmount = match[1];
    const amount = Number(rawAmount.includes(".") ? rawAmount.replaceAll(",", "") : rawAmount.replace(",", "."));
    if (!description || description.length < 2 || !Number.isFinite(amount) || amount <= 0) continue;
    const category = guessCategory(description) ?? merchantCategory;
    items.push({ description: description.slice(0, 100), amount, category });
  }
  return items;
}

function parseAmount(value: string): number {
  const normalized = value.includes(".")
    ? value.replaceAll(",", "")
    : value.replace(",", ".");
  return Number(normalized);
}

function extractMerchantName(lines: string[]): string {
  for (const line of lines.slice(0, 12)) {
    const candidate = line
      .replace(/^(?:welcome to|tax invoice|receipt|invoice|customer copy|merchant copy)\s*/i, "")
      .replace(/\b(?:tax invoice|customer copy|merchant copy|receipt|invoice)\b.*$/i, "")
      .replace(/\s+\d{7,}.*$/, "")
      .trim();
    if (
      candidate.length >= 2 &&
      /[a-z]/i.test(candidate) &&
      !/^(?:no\.?|number|bill|date|time|tel|telephone|phone|mobile|address|cashier|terminal|trn|vat|tax|welcome|thank you)\b/i.test(candidate) &&
      !/^https?:|^www\./i.test(candidate)
    ) {
      return candidate.slice(0, 60);
    }
  }
  return "";
}

export function extractBillFields(text: string): Partial<ExpenseInput> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fullText = lines.join(" ");
  const merchant = extractMerchantName(lines);
  const category = guessCategory(`${merchant} ${fullText}`) ?? "Other";
  const items = parseLineItems(lines, category);
  const dateMatch = fullText.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/);
  let date = "";
  if (dateMatch) {
    const parts = dateMatch[0].split(/[-/.]/);
    if (parts[0].length === 4) date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    else date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }

  const amountMatches = [...fullText.matchAll(/(?:AED|د\.?\s*إ)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{1,2})?)/gi)];
  const totalLineIndex = lines.reduce((lastIndex, line, index) =>
    /\b(total|amount due|grand total|balance due|net payable|total payable)\b/i.test(line) && !/\bsub.?total\b/i.test(line)
      ? index
      : lastIndex,
  -1);
  const amountPattern = /(?:AED|د\.?\s*إ)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{1,2})?)/i;
  const totalLine = totalLineIndex >= 0 ? lines[totalLineIndex] : undefined;
  const totalMatch = totalLine?.match(amountPattern) ??
    (totalLineIndex >= 0 ? lines[totalLineIndex + 1]?.match(amountPattern) ?? lines[totalLineIndex - 1]?.match(amountPattern) : undefined);
  const amountText = totalMatch?.[1] ?? (items.length ? undefined : amountMatches.at(-1)?.[1]);
  const amount = amountText ? parseAmount(amountText) : items.length ? items.reduce((sum, item) => sum + item.amount, 0) : undefined;
  const taxAmountText = [...lines].reverse()
    .filter((line) => /\b(tax|vat|gst)\b/i.test(line))
    .map((line) => line.match(/(?:AED|د\.?\s*إ)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{2})/i)?.[1])
    .find((value) => value !== undefined);
  const invoiceMatch = fullText.match(/(?:invoice|receipt|bill)\s*(?:no\.?|#|number)?\s*[:#-]?\s*([A-Z0-9-]{4,})/i);

  return {
    merchant,
    invoiceNumber: invoiceMatch?.[1] ?? "",
    date,
    amount,
    tax: taxAmountText ? parseAmount(taxAmountText) : 0,
    paymentMethod: /visa/i.test(fullText) ? "Card" : /cash/i.test(fullText) ? "Cash" : "",
    category,
    items,
  };
}

export function mergeScannedFields(
  current: ExpenseInput,
  extracted: Partial<ExpenseInput>,
): ExpenseInput {
  const extractedAmount = extracted.amount;
  return {
    ...current,
    ...extracted,
    merchant: current.merchant.trim() ? current.merchant : extracted.merchant?.trim() || current.merchant,
    amount: current.amount > 0
      ? current.amount
      : extractedAmount !== undefined && Number.isFinite(extractedAmount) && extractedAmount > 0
        ? extractedAmount
        : current.amount,
    items: current.items.length ? current.items : extracted.items ?? current.items,
    createdAt: current.createdAt,
  };
}

export async function readBill(
  image: File,
  onProgress: (progress: number) => void,
): Promise<Partial<ExpenseInput>> {
  const worker = await createWorker("eng", undefined, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(message.progress);
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return extractBillFields(data.text);
  } finally {
    await worker.terminate();
  }
}
