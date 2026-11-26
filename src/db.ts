import Dexie, { type EntityTable } from "dexie";
import type { BillImage, Expense, ExpenseInput } from "./types";

class SpendlyDatabase extends Dexie {
  expenses!: EntityTable<Expense, "id">;
  images!: EntityTable<BillImage, "id">;

  constructor() {
    super("spendly-local");
    this.version(1).stores({
      expenses: "++id, merchant, invoiceNumber, date, category, paymentMethod",
      images: "++id, name",
    });
    this.version(2)
      .stores({
        expenses: "++id, merchant, invoiceNumber, date, category, paymentMethod",
        images: "++id, name",
      })
      .upgrade(async (transaction) => {
        await transaction.table("expenses").toCollection().modify((expense: Record<string, unknown>) => {
          const legacyCategories: Record<string, string> = {
            "Food & dining": "Dining & cafes",
            Transport: "Transport & fuel",
            Shopping: "Shopping & retail",
            "Bills & utilities": "Home & utilities",
            Health: "Health & pharmacy",
            Travel: "Travel & accommodation",
          };
          if (typeof expense.category === "string") {
            expense.category = legacyCategories[expense.category] ?? expense.category;
          }
          if (!Array.isArray(expense.items)) expense.items = [];
        });
      });
    this.version(3)
      .stores({
        expenses: "++id, merchant, invoiceNumber, date, category, paymentMethod",
        images: "++id, name",
      })
      .upgrade(async (transaction) => {
        await transaction.table("expenses").toCollection().modify((expense: Record<string, unknown>) => {
          delete expense.currency;
        });
      });
  }
}

export const database = new SpendlyDatabase();

export async function saveExpense(input: ExpenseInput, image?: File): Promise<void> {
  await database.transaction("rw", database.expenses, database.images, async () => {
    const imageId = image
      ? await database.images.add({ blob: image, name: image.name, type: image.type })
      : undefined;
    await database.expenses.add({ ...input, imageId });
  });
}

export async function updateExpense(
  id: number,
  input: ExpenseInput,
  image?: File,
): Promise<void> {
  await database.transaction("rw", database.expenses, database.images, async () => {
    const existing = await database.expenses.get(id);
    if (!existing) throw new Error("This expense could not be found.");
    let imageId = existing.imageId;
    if (image) {
      if (imageId !== undefined) await database.images.delete(imageId);
      imageId = await database.images.add({ blob: image, name: image.name, type: image.type });
    }
    await database.expenses.put({ ...input, id, imageId });
  });
}

export async function deleteExpense(id: number): Promise<void> {
  await database.transaction("rw", database.expenses, database.images, async () => {
    const expense = await database.expenses.get(id);
    if (expense?.imageId !== undefined) await database.images.delete(expense.imageId);
    await database.expenses.delete(id);
  });
}

export async function clearAllExpenses(): Promise<void> {
  await database.transaction("rw", database.expenses, database.images, async () => {
    await database.expenses.clear();
    await database.images.clear();
  });
}
