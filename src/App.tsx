import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, Camera, Check, ChevronDown, CircleHelp,
  Clock3, FileText, Filter, LayoutDashboard, LoaderCircle, Moon, MoreHorizontal, Plus,
  ReceiptText, Search, Settings, ShieldCheck, Sparkles, Sun, Tag, Trash2, Upload, Wallet,
  X,
} from "lucide-react";
import { database, deleteExpense, clearAllExpenses, saveExpense, updateExpense } from "./db";
import { mergeScannedFields, readBill } from "./ocr";
import { CATEGORIES, type Category, type Expense, type ExpenseInput, type ExpenseItem } from "./types";

type Page = "Overview" | "Expenses" | "Settings";
type Notice = { text: string; tone: "success" | "error" } | null;
function money(value: number) {
  try {
    return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 2 }).format(value);
  } catch {
    return `AED ${value.toFixed(2)}`;
  }
}

function expenseAmount(value: number) {
  return value > 0 ? money(value) : "Not detected";
}

function merchantName(value: string) {
  return value.trim() || "Unnamed merchant";
}

function localDateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function initialForm(): ExpenseInput {
  return {
    merchant: "",
    invoiceNumber: "",
    date: localDateString(new Date()),
    amount: 0,
    tax: 0,
    paymentMethod: "",
    category: "Other",
    items: [],
    createdAt: Date.now(),
  };
}

const categoryColors: Record<string, string> = {
  Groceries: "#72a78a", "Dining & cafes": "#e6a76c", Entertainment: "#9b8ac4",
  "Health & pharmacy": "#72aeb0", "Transport & fuel": "#7c9f8c", "Shopping & retail": "#ce8caa",
  "Home & utilities": "#d7776c", "Travel & accommodation": "#7292c3", Education: "#b49261",
  "Personal care": "#c87eb0", "Fitness & wellness": "#69a7a4", "Telecom & internet": "#738fc0",
  "Government & fees": "#9a8b7b", "Gifts & donations": "#d28c80", Pets: "#a68a62",
  Insurance: "#80999f", Other: "#9da8aa",
};

function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [dark, setDark] = useState(() => localStorage.getItem("spendly-theme") === "dark");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [monthFilter, setMonthFilter] = useState("");
  const [modal, setModal] = useState<"new" | "edit" | "detail" | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [form, setForm] = useState<ExpenseInput>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [file, setFile] = useState<File | undefined>();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState("");
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const records = await database.expenses.orderBy("date").reverse().toArray();
    setExpenses(records);
  };

  useEffect(() => {
    reload().catch((error: unknown) => setNotice({ text: `Could not load expenses: ${String(error)}`, tone: "error" }))
      .finally(() => setLoading(false));
    if ("storage" in navigator && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => setStorageUsage(estimate.usage ?? null)).catch(() => setStorageUsage(null));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("spendly-theme", dark ? "dark" : "light");
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (modal !== "detail" || selected?.imageId === undefined) {
      setImageUrl("");
      return;
    }
    let url = "";
    database.images.get(selected.imageId).then((image) => {
      if (image) {
        url = URL.createObjectURL(image.blob);
        setImageUrl(url);
      }
    }).catch((error: unknown) => setNotice({ text: `Could not load bill image: ${String(error)}`, tone: "error" }));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [modal, selected]);

  const currentMonth = localDateString(new Date()).slice(0, 7);
  const monthlyExpenses = expenses.filter((item) => item.date.startsWith(currentMonth));
  const monthTotal = monthlyExpenses.reduce((sum, item) => sum + item.amount, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const weeklyTotal = expenses.filter((item) => {
    const date = new Date(`${item.date}T00:00:00`);
    return date >= weekStart && date <= today;
  })
    .reduce((sum, item) => sum + item.amount, 0);
  const expensesWithAmount = expenses.filter((item) => item.amount > 0);
  const average = expensesWithAmount.length
    ? expensesWithAmount.reduce((sum, item) => sum + item.amount, 0) / expensesWithAmount.length
    : 0;
  const categoryTotals = useMemo(() => CATEGORIES.map((category) => ({
    category,
    total: expenses.reduce((total, expense) => {
      const items = expense.items ?? [];
      const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
      if (itemTotal > 0) {
        const categoryItemsTotal = items.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0);
        return total + expense.amount * categoryItemsTotal / itemTotal;
      }
      return total + (expense.category === category ? expense.amount : 0);
    }, 0),
  })).sort((a, b) => b.total - a.total), [expenses]);
  const filteredExpenses = useMemo(() => expenses.filter((item) => {
    const matchesText = `${item.merchant} ${item.invoiceNumber}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = categoryFilter === "All categories" || item.category === categoryFilter || (item.items ?? []).some((line) => line.category === categoryFilter);
    const matchesMonth = !monthFilter || item.date.startsWith(monthFilter);
    return matchesText && matchesCategory && matchesMonth;
  }), [expenses, query, categoryFilter, monthFilter]);

  const openNew = () => {
    setForm(initialForm());
    setEditingId(null);
    setFile(undefined);
    setPendingFiles([]);
    setValidation("");
    setOcrProgress(0);
    setModal("new");
  };

  const openEdit = (expense: Expense) => {
    const fields: ExpenseInput = {
      merchant: expense.merchant,
      invoiceNumber: expense.invoiceNumber,
      date: expense.date,
      amount: expense.amount,
      tax: expense.tax,
      paymentMethod: expense.paymentMethod,
      category: expense.category,
      items: expense.items ?? [],
      imageId: expense.imageId,
      createdAt: expense.createdAt,
    };
    setForm(fields);
    setEditingId(expense.id ?? null);
    setFile(undefined);
    setPendingFiles([]);
    setValidation("");
    setSelected(expense);
    setModal("edit");
  };

  const setField = <K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setItems = (items: ExpenseItem[]) => setField("items", items);

  const scanBillFile = async (billFile: File) => {
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const extracted = await readBill(billFile, setOcrProgress);
      setForm((current) => mergeScannedFields(current, extracted));
      setNotice({ text: "Scan complete. Merchant and bill total were filled where found; review them before saving.", tone: "success" });
    } catch (error) {
      setNotice({ text: `Could not read this bill. You can enter the details manually. ${String(error)}`, tone: "error" });
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  };

  const handleFiles = (selectedFiles: File[]) => {
    if (!selectedFiles.length) {
      setFile(undefined);
      setPendingFiles([]);
      return;
    }
    const accepted = selectedFiles.filter((selectedFile) =>
      ["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type),
    );
    if (!accepted.length) {
      setNotice({ text: "Choose JPG, PNG, or WebP bill images.", tone: "error" });
      return;
    }
    if (accepted.length !== selectedFiles.length) {
      setNotice({ text: "Some files were skipped. Choose JPG, PNG, or WebP bill images.", tone: "error" });
    }
    setFile(accepted[0]);
    setPendingFiles(accepted.slice(1));
    setValidation("");
    void scanBillFile(accepted[0]);
  };

  const scanBill = () => {
    if (file) void scanBillFile(file);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.date || Number.isNaN(Date.parse(`${form.date}T00:00:00`))) return setValidation("Enter a valid bill date.");
    if (!Number.isFinite(form.amount) || form.amount < 0) return setValidation("Enter a valid total amount.");
    if (!Number.isFinite(form.tax) || form.tax < 0) return setValidation("Tax must be zero or a positive amount.");
    if (form.items.some((item) => !item.description.trim() || !Number.isFinite(item.amount) || item.amount <= 0)) {
      return setValidation("Complete or remove each item: add a name and a price greater than zero.");
    }
    setSaving(true);
    try {
      const validForm = { ...form, merchant: form.merchant.trim(), invoiceNumber: form.invoiceNumber.trim() };
      if (editingId !== null) await updateExpense(editingId, validForm, file);
      else await saveExpense(validForm, file);
      await reload();
      if (editingId === null && pendingFiles.length > 0) {
        const nextFile = pendingFiles[0];
        setFile(nextFile);
        setPendingFiles(pendingFiles.slice(1));
        setForm(initialForm());
        setValidation("");
        setNotice({ text: `Expense saved. Review the next bill${pendingFiles.length > 1 ? ` (${pendingFiles.length} remaining)` : ""}.`, tone: "success" });
        void scanBillFile(nextFile);
      } else {
        setModal(null);
        setNotice({ text: editingId !== null ? "Expense updated." : "Expense saved to this device.", tone: "success" });
      }
    } catch (error) {
      setNotice({ text: `Could not save this expense: ${String(error)}`, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (expense: Expense) => {
    if (expense.id === undefined || !window.confirm(`Delete ${expense.merchant || "this expense"}? This cannot be undone.`)) return;
    try {
      await deleteExpense(expense.id);
      await reload();
      setModal(null);
      setNotice({ text: "Expense and its attached image were deleted.", tone: "success" });
    } catch (error) {
      setNotice({ text: `Could not delete this expense: ${String(error)}`, tone: "error" });
    }
  };

  const exportCsv = () => {
    const headings = ["Merchant", "Invoice number", "Date", "Amount (AED)", "Tax (AED)", "Payment method", "Category", "Receipt items"];
    const rows = filteredExpenses.map((item) => [
      item.merchant, item.invoiceNumber, item.date, item.amount > 0 ? item.amount : "", item.tax, item.paymentMethod, item.category,
      (item.items ?? []).map((line) => `${line.description}: ${line.amount} AED (${line.category})`).join("; "),
    ]);
    const csv = [headings, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), "spendly-expenses.csv");
  };

  const exportBackup = async () => {
    try {
      const [records, images] = await Promise.all([database.expenses.toArray(), database.images.toArray()]);
      const imageData = await Promise.all(images.map(async (image) => ({
        id: image.id,
        name: image.name,
        type: image.type,
        data: await blobToDataUrl(image.blob),
      })));
      download(new Blob([JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), expenses: records, images: imageData }, null, 2)], { type: "application/json" }), "spendly-backup.json");
      setNotice({ text: "Your backup is ready.", tone: "success" });
    } catch (error) {
      setNotice({ text: `Could not create a backup: ${String(error)}`, tone: "error" });
    }
  };

  const clearExpenses = async () => {
    if (!window.confirm("Delete every saved expense and bill image? This action cannot be undone.")) return;
    try {
      await clearAllExpenses();
      await reload();
      setNotice({ text: "All expenses and bill images were deleted.", tone: "success" });
    } catch (error) {
      setNotice({ text: `Could not clear your data: ${String(error)}`, tone: "error" });
    }
  };

  const deleteImages = async () => {
    if (!window.confirm("Delete all uploaded bill images? Expense details will remain, but images cannot be recovered.")) return;
    try {
      await database.transaction("rw", database.images, database.expenses, async () => {
        await database.images.clear();
        await database.expenses.toCollection().modify({ imageId: undefined });
      });
      await reload();
      setNotice({ text: "All bill images were deleted.", tone: "success" });
    } catch (error) {
      setNotice({ text: `Could not delete bill images: ${String(error)}`, tone: "error" });
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage("Overview"); }}>
          <span className="brand-mark"><Wallet size={19} strokeWidth={2.2} /></span>
          <span>spendly<span className="brand-period">.</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavButton active={page === "Overview"} icon={<LayoutDashboard size={18} />} label="Overview" onClick={() => setPage("Overview")} />
          <NavButton active={page === "Expenses"} icon={<ReceiptText size={18} />} label="Expenses" count={expenses.length} onClick={() => setPage("Expenses")} />
          <NavButton active={page === "Settings"} icon={<Settings size={18} />} label="Settings" onClick={() => setPage("Settings")} />
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="privacy-icon"><ShieldCheck size={17} /></div>
            <strong>Your data stays yours</strong>
            <p>Saved privately on this device.</p>
            <button onClick={() => setPage("Settings")}>Learn about your data <ArrowRight size={13} /></button>
          </div>
          <div className="profile">
            <div className="avatar">A</div>
            <div className="profile-text"><strong>My workspace</strong><span>Personal account</span></div>
            <button className="icon-button profile-menu" aria-label="Workspace options"><MoreHorizontal size={19} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Wallet size={18} /></span> spendly<span className="brand-period">.</span></div>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{page}</strong></div>
          <div className="top-actions">
            <button className="icon-button theme-toggle" onClick={() => setDark((value) => !value)} aria-label={`Switch to ${dark ? "light" : "dark"} theme`}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="help-button" onClick={() => setNotice({ text: "Tip: upload a bill and let Spendly fill in the details. Always review OCR results before saving.", tone: "success" })}>
              <CircleHelp size={17} /><span>Help</span>
            </button>
            <button className="button button-primary top-add" onClick={openNew}><Plus size={16} /> Add expense</button>
          </div>
        </header>

        <div className="content-area">
          {page === "Overview" && <Overview
            expenses={expenses} monthlyTotal={monthTotal} weeklyTotal={weeklyTotal} average={average}
            categories={categoryTotals} onAdd={openNew} onAll={() => setPage("Expenses")}
            onSelect={(expense) => { setSelected(expense); setModal("detail"); }}
          />}
          {page === "Expenses" && <ExpensesPage
            expenses={filteredExpenses} query={query} setQuery={setQuery} categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter} monthFilter={monthFilter} setMonthFilter={setMonthFilter}
            onAdd={openNew} onExport={exportCsv}
            onSelect={(expense) => { setSelected(expense); setModal("detail"); }}
          />}
          {page === "Settings" && <SettingsPage
            count={expenses.length} storageUsage={storageUsage} onBackup={exportBackup}
            onDeleteImages={deleteImages} onClear={clearExpenses}
          />}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavButton active={page === "Overview"} icon={<LayoutDashboard size={19} />} label="Home" onClick={() => setPage("Overview")} />
        <NavButton active={page === "Expenses"} icon={<ReceiptText size={19} />} label="Expenses" onClick={() => setPage("Expenses")} />
        <button className="mobile-add" aria-label="Add expense" onClick={openNew}><Plus size={22} /></button>
        <NavButton active={page === "Settings"} icon={<Settings size={19} />} label="Settings" onClick={() => setPage("Settings")} />
      </nav>

      {modal === "new" || modal === "edit" ? <ExpenseFormModal
        mode={modal} form={form} setField={setField} setItems={setItems} file={file} remainingFiles={pendingFiles.length} onFiles={handleFiles} uploadRef={uploadRef}
        onClose={() => setModal(null)} onSave={save} onScan={scanBill} scanning={ocrBusy} progress={ocrProgress}
        saving={saving} validation={validation}
      /> : null}
      {modal === "detail" && selected ? <DetailModal
        expense={selected} imageUrl={imageUrl} onClose={() => setModal(null)} onEdit={() => openEdit(selected)}
        onDelete={() => void remove(selected)}
      /> : null}
      {notice && <div role="status" className={`toast toast-${notice.tone}`}><span className="toast-dot" />{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
      {loading && <div className="loading-screen"><span className="loading-logo"><Wallet size={20} /></span><span>Getting your finances in order…</span></div>}
    </div>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && count > 0 && <span className="nav-count">{count}</span>}</button>;
}

function Overview({ expenses, monthlyTotal, weeklyTotal, average, categories, onAdd, onAll, onSelect }: {
  expenses: Expense[]; monthlyTotal: number; weeklyTotal: number; average: number;
  categories: { category: Category; total: number }[]; onAdd: () => void; onAll: () => void; onSelect: (expense: Expense) => void;
}) {
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const highest = categories.find((item) => item.total > 0);
  const monthLabels = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const key = date.toISOString().slice(0, 7);
    return { label: date.toLocaleDateString(undefined, { month: "short" }), total: expenses.filter((item) => item.date.startsWith(key)).reduce((sum, item) => sum + item.amount, 0) };
  });
  const maxMonth = Math.max(...monthLabels.map((item) => item.total), 1);
  const categorySum = categories.reduce((sum, item) => sum + item.total, 0);
  let chartOffset = 0;
  const segments = categories.filter((item) => item.total > 0).map((item) => {
    const start = chartOffset;
    chartOffset += item.total / (categorySum || 1) * 100;
    return `${categoryColors[item.category]} ${start}% ${chartOffset}%`;
  });

  return <div className="page-wrap">
    <div className="page-heading">
      <div><p className="eyebrow"><span className="live-dot" /> YOUR MONEY, AT A GLANCE</p><h1>Good morning<span className="heading-comma">,</span></h1><p className="page-subtitle">A little clarity goes a long way. Here’s your spending snapshot.</p></div>
      <button className="button button-primary heading-add" onClick={onAdd}><Plus size={16} /> Add an expense</button>
    </div>
    <div className="summary-grid">
      <SummaryCard label="Total tracked" value={money(total)} detail={`${expenses.length} ${expenses.length === 1 ? "transaction" : "transactions"} so far`} icon={<Wallet size={18} />} tone="green" />
      <SummaryCard label="This month" value={money(monthlyTotal)} detail={new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })} icon={<BarChart3 size={18} />} tone="lavender" />
      <SummaryCard label="This week" value={money(weeklyTotal)} detail="Last 7 days" icon={<Clock3 size={18} />} tone="peach" />
      <SummaryCard label="Average spend" value={money(average)} detail="Per transaction" icon={<Sparkles size={18} />} tone="blue" />
    </div>

    <div className="dashboard-grid">
      <section className="panel spending-panel">
        <div className="panel-heading"><div><h2>Spending overview</h2><p>Your last six months</p></div><span className="chart-period"><span className="legend-dot" /> Expenses</span></div>
        {expenses.length ? <div className="bar-chart" aria-label="Monthly expense comparison">
          {monthLabels.map((month) => <div className="bar-column" key={month.label + month.total}><div className="bar-value">{month.total ? money(month.total) : ""}</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(month.total / maxMonth * 100, month.total ? 8 : 0)}%` }} /></div><span>{month.label}</span></div>)}
        </div> : <EmptyChart />}
        <div className="chart-footnote"><span><span className="legend-dot" /> Spending is stored on this device</span><span>Updated just now <Check size={13} /></span></div>
      </section>

      <section className="panel category-panel">
        <div className="panel-heading"><div><h2>Where it goes</h2><p>Spending by category</p></div><button className="icon-button small-more" aria-label="Category options"><MoreHorizontal size={19} /></button></div>
        {categorySum > 0 ? <>
          <div className="donut-wrap"><div className="donut" style={{ background: `conic-gradient(${segments.join(", ")})` }}><div className="donut-hole"><strong>{money(categorySum)}</strong><span>Total spend</span></div></div></div>
          <div className="category-legend">{categories.filter((item) => item.total > 0).slice(0, 4).map((item) => <div className="legend-row" key={item.category}><span className="legend-category"><i style={{ background: categoryColors[item.category] }} />{item.category}</span><strong>{money(item.total)}</strong></div>)}</div>
        </> : <EmptyChart message="Your categories will show up here." />}
      </section>
    </div>

    <section className="panel transactions-panel">
      <div className="panel-heading"><div><h2>Recent transactions</h2><p>Your latest saved bills and expenses</p></div>{expenses.length > 0 && <button className="text-button" onClick={onAll}>View all <ArrowRight size={14} /></button>}</div>
      {expenses.length ? <TransactionList expenses={expenses.slice(0, 5)} onSelect={onSelect} /> : <div className="empty-state">
        <div className="empty-illustration"><ReceiptText size={25} /></div><h3>Your spending story starts here</h3><p>Add your first expense or scan a bill to see everything in one place.</p><button className="button button-primary" onClick={onAdd}><Plus size={16} /> Add your first expense</button>
      </div>}
    </section>
    {highest && <div className="insight-strip"><span className="insight-icon"><Sparkles size={16} /></span><span><strong>Your top category:</strong> {highest.category} accounts for {Math.round(highest.total / categorySum * 100)}% of tracked spending.</span></div>}
  </div>;
}

function SummaryCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: string }) {
  return <article className="summary-card"><div className="summary-top"><span>{label}</span><span className={`summary-icon ${tone}`}>{icon}</span></div><strong className="summary-value">{value}</strong><span className="summary-detail">{detail}</span></article>;
}

function EmptyChart({ message = "Add expenses to see your spending trends." }: { message?: string }) {
  return <div className="chart-empty"><div className="empty-bars"><i /><i /><i /><i /><i /></div><span>{message}</span></div>;
}

function TransactionList({ expenses, onSelect }: { expenses: Expense[]; onSelect: (expense: Expense) => void }) {
  return <div className="transaction-list">{expenses.map((item) => <button className="transaction-row" key={item.id} onClick={() => onSelect(item)}>
    <span className="merchant-icon" style={{ color: categoryColors[item.category], background: `${categoryColors[item.category]}20` }}><Tag size={17} /></span>
    <span className="transaction-main"><strong>{merchantName(item.merchant)}</strong><span>{item.category} <i /> {displayDate(item.date)}</span></span>
    <span className="transaction-amount">{expenseAmount(item.amount)}<span>{item.paymentMethod || "Expense"}</span></span>
    <ArrowRight className="transaction-arrow" size={16} />
  </button>)}</div>;
}

function ExpensesPage({ expenses, query, setQuery, categoryFilter, setCategoryFilter, monthFilter, setMonthFilter, onAdd, onExport, onSelect }: {
  expenses: Expense[]; query: string; setQuery: (value: string) => void; categoryFilter: string;
  setCategoryFilter: (value: string) => void; monthFilter: string; setMonthFilter: (value: string) => void;
  onAdd: () => void; onExport: () => void; onSelect: (expense: Expense) => void;
}) {
  return <div className="page-wrap">
    <div className="page-heading expenses-heading"><div><p className="eyebrow">YOUR SPENDING</p><h1>Expenses<span className="heading-comma">.</span></h1><p className="page-subtitle">Every transaction, neatly in one place.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onExport}><ArrowDownToLine size={16} /> Export CSV</button><button className="button button-primary" onClick={onAdd}><Plus size={16} /> Add expense</button></div></div>
    <section className="panel expense-table-panel">
      <div className="filter-toolbar">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant or invoice…" /></label>
        <label className="select-field"><Filter size={15} /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={14} /></label>
        <label className="month-field"><span>Month</span><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>
        {(query || categoryFilter !== "All categories" || monthFilter) && <button className="clear-filter" onClick={() => { setQuery(""); setCategoryFilter("All categories"); setMonthFilter(""); }}>Clear</button>}
      </div>
      <div className="table-header"><span>MERCHANT</span><span>CATEGORY</span><span>DATE</span><span>PAYMENT</span><span className="amount-head">AMOUNT</span></div>
      {expenses.length ? <div className="expense-rows">{expenses.map((item) => <button className="expense-table-row" key={item.id} onClick={() => onSelect(item)}>
        <span className="table-merchant"><span className="merchant-icon" style={{ color: categoryColors[item.category], background: `${categoryColors[item.category]}20` }}><ReceiptText size={16} /></span><span><strong>{merchantName(item.merchant)}</strong><small>{item.invoiceNumber || "No invoice number"}</small></span></span>
        <span><i className="category-dot" style={{ background: categoryColors[item.category] }} />{item.category}</span>
        <span>{displayDate(item.date)}</span><span>{item.paymentMethod || "—"}</span>
        <strong className="table-amount">{expenseAmount(item.amount)}</strong>
      </button>)}</div> : <div className="table-empty"><div className="empty-illustration"><Search size={22} /></div><h3>No matching expenses</h3><p>Try adjusting your filters, or add an expense to get started.</p><button className="button button-secondary" onClick={onAdd}><Plus size={15} /> Add expense</button></div>}
      <div className="table-footer"><span>Showing <strong>{expenses.length}</strong> {expenses.length === 1 ? "expense" : "expenses"}</span><span><ShieldCheck size={14} /> Private and stored locally</span></div>
    </section>
  </div>;
}

function SettingsPage({ count, storageUsage, onBackup, onDeleteImages, onClear }: { count: number; storageUsage: number | null; onBackup: () => void; onDeleteImages: () => void; onClear: () => void }) {
  const formatBytes = (bytes: number | null) => bytes === null ? "Not available" : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return <div className="page-wrap settings-wrap">
    <div className="page-heading"><div><p className="eyebrow">YOUR SPACE, YOUR RULES</p><h1>Settings<span className="heading-comma">.</span></h1><p className="page-subtitle">Manage your data and make Spendly feel like yours.</p></div></div>
    <section className="panel settings-panel">
      <div className="settings-title"><span className="settings-icon green"><ShieldCheck size={19} /></span><div><h2>Privacy & data</h2><p>Your information stays in your browser and is never sent to a server.</p></div></div>
      <div className="data-stats"><div><span>Saved expenses</span><strong>{count}</strong></div><div><span>Browser storage in use</span><strong>{formatBytes(storageUsage)}</strong></div><div><span>Storage type</span><strong>IndexedDB <i className="secure-dot" /></strong></div></div>
      <div className="setting-row"><div><strong>Export a backup</strong><p>Download your expense records and bill images as a JSON file.</p></div><button className="button button-secondary" onClick={onBackup}><ArrowDownToLine size={15} /> Download backup</button></div>
      <div className="settings-title data-title"><span className="settings-icon orange"><Trash2 size={18} /></span><div><h2>Data management</h2><p>These actions permanently remove data from this device.</p></div></div>
      <div className="setting-row"><div><strong>Delete bill images</strong><p>Keep expense details, but remove every uploaded image.</p></div><button className="button button-danger-outline" onClick={onDeleteImages}>Delete images</button></div>
      <div className="setting-row"><div><strong>Clear all expense data</strong><p>Delete every expense record and its attached image. This cannot be undone.</p></div><button className="button button-danger" onClick={onClear}><Trash2 size={15} /> Clear all data</button></div>
    </section>
    <div className="local-note"><ShieldCheck size={17} /><span><strong>Local by design.</strong> Spendly currently stores data only on this device. Cloud sync is not enabled.</span></div>
    <div className="settings-version"><span>SPENDLY · PERSONAL FINANCE, MADE CLEAR</span><span>Version 0.1.0</span></div>
  </div>;
}

function ExpenseFormModal({ mode, form, setField, setItems, file, remainingFiles, onFiles, uploadRef, onClose, onSave, onScan, scanning, progress, saving, validation }: {
  mode: "new" | "edit"; form: ExpenseInput; setField: <K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) => void;
  setItems: (items: ExpenseItem[]) => void;
  file?: File; remainingFiles: number; onFiles: (files: File[]) => void; uploadRef: React.RefObject<HTMLInputElement>; onClose: () => void;
  onSave: (event: React.FormEvent) => void; onScan: () => void; scanning: boolean; progress: number; saving: boolean; validation: string;
}) {
  const preview = file ? URL.createObjectURL(file) : "";
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
      <div className="modal-header"><div><p className="eyebrow">{mode === "new" ? "NEW TRANSACTION" : "UPDATE DETAILS"}</p><h2 id="expense-modal-title">{mode === "new" ? "Add an expense" : "Edit expense"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      {mode === "new" && <div className="scan-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFiles(Array.from(event.dataTransfer.files)); }}>
        {preview ? <div className="image-preview"><img src={preview} alt="Selected bill preview" /><div className="preview-overlay"><button type="button" className="preview-remove" disabled={scanning} onClick={() => onFiles([])}><X size={15} /> Remove</button></div></div> : <button type="button" className="upload-prompt" onClick={() => uploadRef.current?.click()}><span className="upload-icon"><Upload size={19} /></span><strong>Drop a bill here, or <u>browse files</u></strong><span>JPG or PNG · Your image stays on this device</span><span className="camera-hint"><Camera size={14} /> Scanning can fill the store name and total automatically</span></button>}
        <input ref={uploadRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        {file && <div className="selected-file"><span><FileText size={15} />{file.name}{remainingFiles > 0 ? ` · +${remainingFiles} more` : ""}</span><div className="scan-actions"><button type="button" className="link-button" disabled={scanning} onClick={() => uploadRef.current?.click()}>Add more</button><button type="button" className="button button-scan" onClick={onScan} disabled={scanning}>{scanning ? <><LoaderCircle className="spin" size={15} /> Reading {Math.round(progress * 100)}%</> : <><Sparkles size={15} /> Scan bill</>}</button></div></div>}
        {scanning && <div className="progress-track"><span style={{ width: `${Math.max(progress * 100, 4)}%` }} /></div>}
      </div>}
      <form className="expense-form" onSubmit={(event) => void onSave(event)}>
        <div className="form-section-label"><span>EXPENSE DETAILS</span>{mode === "new" && <span className="optional-note">Review before saving</span>}</div>
        <label className="form-field full-field"><span>Merchant / store <small className="optional-label">Optional · scan to fill</small></span><input value={form.merchant} onChange={(event) => setField("merchant", event.target.value)} placeholder="Type a store or scan a bill" autoFocus /></label>
        <div className="form-two-col">
          <label className="form-field"><span>Bill date <b>*</b></span><input type="date" value={form.date} onChange={(event) => setField("date", event.target.value)} /></label>
          <label className="form-field"><span>Invoice number</span><input value={form.invoiceNumber} onChange={(event) => setField("invoiceNumber", event.target.value)} placeholder="Optional" /></label>
          <label className="form-field"><span>Total amount <small className="optional-label">Optional · scan to fill</small></span><div className="amount-input"><span className="currency-label">AED</span><input type="number" step="0.01" min="0" value={form.amount || ""} onChange={(event) => setField("amount", Number(event.target.value))} placeholder="Scan bill to fill" /></div></label>
          <label className="form-field"><span>Tax / VAT</span><input type="number" step="0.01" min="0" value={form.tax || ""} onChange={(event) => setField("tax", Number(event.target.value))} placeholder="0.00" /></label>
          <label className="form-field"><span>Spend type</span><select value={form.category} onChange={(event) => setField("category", event.target.value as Category)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="form-field"><span>Payment method</span><select value={form.paymentMethod} onChange={(event) => setField("paymentMethod", event.target.value)}><option value="">Not specified</option><option>Card</option><option>Cash</option><option>Bank transfer</option><option>Digital wallet</option><option>Other</option></select></label>
        </div>
        <section className="items-editor" aria-label="Receipt item breakdown">
          <div className="items-editor-heading"><div><strong>Items from this bill</strong><span>Review item names, prices, and spend types extracted from the receipt.</span></div><button type="button" className="button button-secondary add-item-button" onClick={() => setItems([...form.items, { description: "", amount: 0, category: form.category }])}><Plus size={14} /> Add item</button></div>
          {form.items.length ? <div className="item-edit-list">{form.items.map((item, index) => <div className="item-edit-row" key={`${index}-${item.description}`}>
            <label className="form-field item-name-field"><span>Item</span><input value={item.description} onChange={(event) => setItems(form.items.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} placeholder="Item name" /></label>
            <label className="form-field item-price-field"><span>Price (AED)</span><input type="number" min="0.01" step="0.01" value={item.amount || ""} onChange={(event) => setItems(form.items.map((row, rowIndex) => rowIndex === index ? { ...row, amount: Number(event.target.value) } : row))} placeholder="0.00" /></label>
            <label className="form-field item-category-field"><span>Spend type</span><select value={item.category} onChange={(event) => setItems(form.items.map((row, rowIndex) => rowIndex === index ? { ...row, category: event.target.value as Category } : row))}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <button type="button" className="icon-button remove-item-button" aria-label={`Remove ${item.description || "item"}`} onClick={() => setItems(form.items.filter((_, rowIndex) => rowIndex !== index))}><X size={15} /></button>
          </div>)}</div> : <p className="items-empty">No individual items detected yet. You can add them here.</p>}
        </section>
        {validation && <p className="form-error" role="alert">{validation}</p>}
        <div className="modal-footer"><span><ShieldCheck size={14} /> Saved privately on this device</span><div><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving || scanning}>{saving ? <><LoaderCircle size={15} className="spin" /> Saving…</> : scanning ? <><LoaderCircle size={15} className="spin" /> Reading bill…</> : <><Check size={15} /> {mode === "new" ? "Save expense" : "Save changes"}</>}</button></div></div>
      </form>
    </section>
  </div>;
}

function DetailModal({ expense, imageUrl, onClose, onEdit, onDelete }: { expense: Expense; imageUrl: string; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div className="detail-top"><button className="back-button" onClick={onClose}><ArrowLeft size={16} /> Back to expenses</button><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="detail-amount"><span className="merchant-icon" style={{ color: categoryColors[expense.category], background: `${categoryColors[expense.category]}20` }}><ReceiptText size={19} /></span><span className="detail-category">{expense.category}</span><h2 id="detail-title">{merchantName(expense.merchant)}</h2><strong>{expenseAmount(expense.amount)}</strong><span>{displayDate(expense.date)}</span></div>
      <div className="detail-buttons"><button className="button button-secondary" onClick={onEdit}><FileText size={15} /> Edit details</button><button className="button button-danger-outline" onClick={onDelete}><Trash2 size={15} /> Delete</button></div>
      <div className="detail-list">
        <DetailRow label="Invoice number" value={expense.invoiceNumber || "—"} />
        <DetailRow label="Tax / VAT" value={money(expense.tax)} />
        <DetailRow label="Payment method" value={expense.paymentMethod || "Not specified"} />
      </div>
      {(expense.items ?? []).length > 0 && <section className="detail-items">
        <div className="detail-items-heading"><strong>Items on this bill</strong><span>Individual prices</span></div>
        {(expense.items ?? []).map((item, index) => <div className="detail-item-row" key={`${index}-${item.description}`}>
          <span className="detail-item-name"><strong>{item.description}</strong><small>{item.category}</small></span>
          <strong>{money(item.amount)}</strong>
        </div>)}
      </section>}
      <div className="receipt-preview"><div className="receipt-title"><span>ORIGINAL BILL</span>{expense.imageId ? <span>Saved on device</span> : null}</div>{imageUrl ? <img src={imageUrl} alt={`Original bill from ${expense.merchant}`} /> : <div className="no-receipt">{expense.imageId ? <LoaderCircle size={18} className="spin" /> : <><ReceiptText size={20} /><span>No bill image attached</span></>}</div>}</div>
    </section>
  </div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not encode an image."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read an image."));
    reader.readAsDataURL(blob);
  });
}

export default App;
