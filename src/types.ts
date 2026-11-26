export const CATEGORIES = [
  "Groceries",
  "Dining & cafes",
  "Entertainment",
  "Health & pharmacy",
  "Transport & fuel",
  "Shopping & retail",
  "Home & utilities",
  "Travel & accommodation",
  "Education",
  "Personal care",
  "Fitness & wellness",
  "Telecom & internet",
  "Government & fees",
  "Gifts & donations",
  "Pets",
  "Insurance",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface ExpenseItem {
  description: string;
  amount: number;
  category: Category;
}

export interface Expense {
  id?: number;
  merchant: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  tax: number;
  paymentMethod: string;
  category: Category;
  items: ExpenseItem[];
  imageId?: number;
  createdAt: number;
}

export interface BillImage {
  id?: number;
  blob: Blob;
  name: string;
  type: string;
}

export type ExpenseInput = Omit<Expense, "id">;
