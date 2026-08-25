function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(n) {
  const num = Number(n) || 0;
  return "Rs. " + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// Rough AD -> BS year approximation (Nepali New Year falls ~mid-April).
// This is NOT calendar-accurate; it's a starting suggestion the admin
// should verify/override in Settings.
function suggestBSYear() {
  const now = new Date();
  const adYear = now.getFullYear();
  const adMonth = now.getMonth() + 1;
  return adMonth >= 4 ? adYear + 57 : adYear + 56;
}

// Clamp a value to a safe non-negative number.
function safeNumber(v, fallback = 0) {
  const n = parseFloat(v);
  if (isNaN(n) || n < 0) return fallback;
  return n;
}

function toast(msg, type = "info") {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.className = "fixed top-4 right-4 z-[999] flex flex-col gap-2";
    document.body.appendChild(box);
  }
  const colors = { info: "bg-navy", success: "bg-emerald-600", error: "bg-rose-600" };
  const el = document.createElement("div");
  el.className = `${colors[type] || colors.info} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg opacity-0 -translate-y-2 transition-all duration-300`;
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.remove("opacity-0", "-translate-y-2"));
  setTimeout(() => {
    el.classList.add("opacity-0", "-translate-y-2");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// Deterministic color for a category badge so arbitrary/custom category
// names (not just the original 4) still get a consistent, readable color.
const BADGE_PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-lime-100 text-lime-700",
];
function categoryBadgeClasses(name) {
  const str = String(name || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return BADGE_PALETTE[hash % BADGE_PALETTE.length];
}
function categoryBadgeHTML(name) {
  return `<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${categoryBadgeClasses(name)}">${escapeHTML(name)}</span>`;
}

// Populate a <select> with categories from the DB. Keeps a leading
// placeholder/blank option if requested.
async function populateCategorySelect(selectEl, { blankLabel = null } = {}) {
  const categories = await DB.getAll("categories");
  const opts = categories.map((c) => `<option>${escapeHTML(c.name)}</option>`).join("");
  selectEl.innerHTML = (blankLabel ? `<option value="">${escapeHTML(blankLabel)}</option>` : "") + opts;
}

const NAV_LINKS = [
  { href: "index.html", label: "Dashboard", key: "dashboard" },
  { href: "new-bill.html", label: "New Bill", key: "new-bill" },
  { href: "bill-history.html", label: "Bill History", key: "history" },
  { href: "doctors.html", label: "Doctor Performance", key: "doctors" },
  { href: "settings.html", label: "Settings", key: "settings" },
];

function renderNav(activeKey) {
  const mount = document.getElementById("nav");
  if (!mount) return;
  const linkClass = (active) =>
    "px-3 py-2 rounded-lg text-sm font-medium transition " +
    (active ? "bg-teal text-white" : "text-slate-200 hover:bg-white/10 hover:text-white");
  const links = NAV_LINKS.map((l) => `<a href="${l.href}" class="${linkClass(l.key === activeKey)}">${l.label}</a>`).join("");

  mount.innerHTML = `
    <div class="bg-navy shadow-md">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="bg-teal text-white text-[11px] font-extrabold tracking-wide px-2 py-1 rounded-md">HBS</span>
          <span class="text-white font-semibold text-[15px]">Hospital Billing System</span>
        </div>
        <button id="nav-toggle" class="sm:hidden text-white text-2xl leading-none px-1" aria-label="Menu">&#9776;</button>
        <nav class="hidden sm:flex gap-1 flex-wrap">${links}</nav>
      </div>
      <nav id="nav-mobile" class="sm:hidden hidden flex-col gap-1 px-4 pb-3">${links}</nav>
    </div>`;

  const toggle = document.getElementById("nav-toggle");
  const mobile = document.getElementById("nav-mobile");
  toggle?.addEventListener("click", () => mobile.classList.toggle("hidden"));
}

// Initializes DB + seeds sample data; call at top of every page's script.
async function initPage(activeKey) {
  renderNav(activeKey);
  await seedIfEmpty();
}
