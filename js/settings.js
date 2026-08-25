(async function () {
  await initPage("settings");

  // ---------- Tabs ----------
  function activateTab(btn) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("text-teal", "border-teal");
      b.classList.add("text-slate-500", "border-transparent");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.remove("text-slate-500", "border-transparent");
    btn.classList.add("text-teal", "border-teal");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", () => activateTab(btn)));
  activateTab(document.querySelector(".tab-btn"));

  // ---------- Hospital Info ----------
  const settings = (await DB.get("settings", 1)) || {};
  const $ = (id) => document.getElementById(id);
  $("i-name").value = settings.hospitalName || "";
  $("i-pan").value = settings.pan || "";
  $("i-address").value = settings.address || "";
  $("i-phone").value = settings.phone || "";
  $("i-email").value = settings.email || "";
  $("i-signatory").value = settings.signatoryName || "";
  $("i-bsyear").value = settings.bsYear || suggestBSYear();
  $("i-footer").value = settings.footerNote || "";
  let logoData = settings.logo || "";
  if (logoData) {
    $("logo-preview").src = logoData;
    $("logo-preview").style.display = "inline-block";
  }

  $("suggest-bsyear").addEventListener("click", () => {
    $("i-bsyear").value = suggestBSYear();
  });

  $("i-logo").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast("Logo must be a PNG or JPG image.", "error");
      e.target.value = "";
      return;
    }
    if (file.size > 500 * 1024) {
      toast("Logo must be under 500KB.", "error");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoData = reader.result;
      $("logo-preview").src = logoData;
      $("logo-preview").style.display = "inline-block";
    };
    reader.readAsDataURL(file);
  });

  $("info-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bsYear = safeNumber($("i-bsyear").value, suggestBSYear());
    await DB.put("settings", {
      id: 1,
      hospitalName: $("i-name").value.trim(),
      pan: $("i-pan").value.trim(),
      address: $("i-address").value.trim(),
      phone: $("i-phone").value.trim(),
      email: $("i-email").value.trim(),
      signatoryName: $("i-signatory").value.trim(),
      bsYear,
      footerNote: $("i-footer").value.trim(),
      logo: logoData,
    });
    toast("Hospital info saved.", "success");
  });

  // ---------- Categories ----------
  async function renderCategories() {
    const list = await DB.getAll("categories");
    const wrap = document.getElementById("category-list");
    wrap.innerHTML =
      list
        .map(
          (c) => `<span class="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full ${categoryBadgeClasses(c.name)} text-sm font-semibold">
        ${escapeHTML(c.name)}
        <button data-id="${c.id}" data-action="del-cat" class="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center text-xs" title="Delete category">✕</button>
      </span>`
        )
        .join("") || `<p class="text-sm text-slate-400">No categories yet.</p>`;

    // Keep category dropdowns everywhere on this page in sync.
    await populateCategorySelect(document.getElementById("pr-category"));
    await populateCategorySelect(document.getElementById("dr-category"));
    await populateCategorySelect(document.getElementById("pkg-category"));
  }

  document.getElementById("category-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("cat-name");
    const name = nameInput.value.trim();
    if (!name) {
      toast("Enter a category name.", "error");
      return;
    }
    const existing = await DB.getAll("categories");
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast("That category already exists.", "error");
      return;
    }
    await DB.add("categories", { name });
    nameInput.value = "";
    toast("Category added.", "success");
    renderCategories();
  });

  document.getElementById("category-list").addEventListener("click", async (e) => {
    if (e.target.dataset.action === "del-cat") {
      if (!confirm("Remove this category from future dropdowns? Existing records that used it are unaffected.")) return;
      await DB.delete("categories", Number(e.target.dataset.id));
      renderCategories();
    }
  });

  // ---------- Price List ----------
  async function renderPriceList() {
    const list = await DB.getAll("priceList");
    const body = document.getElementById("price-body");
    body.innerHTML =
      list
        .map(
          (p) => `<tr class="border-t border-slate-100 hover:bg-slate-50">
        <td class="py-2.5">${escapeHTML(p.name)}</td>
        <td class="py-2.5">${categoryBadgeHTML(p.category)}</td>
        <td class="py-2.5 text-right font-medium">${formatCurrency(p.rate)}</td>
        <td class="py-2.5">${escapeHTML(p.unit || "-")}</td>
        <td class="py-2.5">${p.active === false ? '<span class="text-xs text-slate-400">Inactive</span>' : '<span class="text-xs text-emerald-600 font-semibold">Active</span>'}</td>
        <td class="py-2.5 text-right whitespace-nowrap">
          <button class="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs font-semibold hover:border-teal hover:text-teal transition mr-1" data-id="${p.id}" data-action="toggle-price">${p.active === false ? "Activate" : "Deactivate"}</button>
          <button class="px-2.5 py-1.5 rounded-md border border-rose-300 text-rose-600 text-xs font-semibold hover:bg-rose-600 hover:text-white transition" data-id="${p.id}" data-action="del-price">Delete</button>
        </td>
      </tr>`
        )
        .join("") || `<tr><td colspan="6" class="text-center text-slate-400 py-8">No items yet.</td></tr>`;
  }

  document.getElementById("price-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("pr-name").value.trim();
    const rate = safeNumber($("pr-rate").value, -1);
    if (!name || rate < 0) {
      toast("Enter a valid item name and rate.", "error");
      return;
    }
    await DB.add("priceList", {
      name,
      category: $("pr-category").value,
      rate,
      unit: $("pr-unit").value.trim(),
      active: true,
    });
    e.target.reset();
    toast("Item added to price list.", "success");
    renderPriceList();
  });

  document.getElementById("price-body").addEventListener("click", async (e) => {
    const id = Number(e.target.dataset.id);
    if (e.target.dataset.action === "del-price") {
      if (!confirm("Remove this item from the price list? Existing bills are unaffected.")) return;
      await DB.delete("priceList", id);
      renderPriceList();
    } else if (e.target.dataset.action === "toggle-price") {
      const item = await DB.get("priceList", id);
      item.active = item.active === false ? true : false;
      await DB.put("priceList", item);
      renderPriceList();
    }
  });

  // ---------- Doctors ----------
  async function renderDoctors() {
    const list = await DB.getAll("doctors");
    const body = document.getElementById("doctor-body");
    body.innerHTML =
      list
        .map(
          (d) => `<tr class="border-t border-slate-100 hover:bg-slate-50">
        <td class="py-2.5">${escapeHTML(d.name)}</td>
        <td class="py-2.5">${categoryBadgeHTML(d.category)}</td>
        <td class="py-2.5">${escapeHTML(d.department || "-")}</td>
        <td class="py-2.5">${escapeHTML(d.contact || "-")}</td>
        <td class="py-2.5 text-right">${safeNumber(d.commissionPercent, 0)}%</td>
        <td class="py-2.5">${d.active === false ? '<span class="text-xs text-slate-400">Inactive</span>' : '<span class="text-xs text-emerald-600 font-semibold">Active</span>'}</td>
        <td class="py-2.5 text-right whitespace-nowrap">
          <button class="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs font-semibold hover:border-teal hover:text-teal transition mr-1" data-id="${d.id}" data-action="toggle-doc">${d.active === false ? "Activate" : "Deactivate"}</button>
          <button class="px-2.5 py-1.5 rounded-md border border-rose-300 text-rose-600 text-xs font-semibold hover:bg-rose-600 hover:text-white transition" data-id="${d.id}" data-action="del-doc">Delete</button>
        </td>
      </tr>`
        )
        .join("") || `<tr><td colspan="7" class="text-center text-slate-400 py-8">No doctors yet.</td></tr>`;
  }

  document.getElementById("doctor-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("dr-name").value.trim();
    if (!name) {
      toast("Enter a doctor name.", "error");
      return;
    }
    await DB.add("doctors", {
      name,
      category: $("dr-category").value,
      department: $("dr-dept").value.trim(),
      contact: $("dr-contact").value.trim(),
      commissionPercent: safeNumber($("dr-commission").value, 0),
      active: true,
    });
    e.target.reset();
    toast("Doctor added.", "success");
    renderDoctors();
  });

  document.getElementById("doctor-body").addEventListener("click", async (e) => {
    const id = Number(e.target.dataset.id);
    if (e.target.dataset.action === "del-doc") {
      if (!confirm("Remove this doctor? Past bills keep their recorded doctor name for history.")) return;
      await DB.delete("doctors", id);
      renderDoctors();
    } else if (e.target.dataset.action === "toggle-doc") {
      const doc = await DB.get("doctors", id);
      doc.active = doc.active === false ? true : false;
      await DB.put("doctors", doc);
      renderDoctors();
    }
  });

  // ---------- Packages ----------
  let pkgRowSeq = 0;
  function addPkgRow(preset) {
    const wrap = document.getElementById("pkg-items");
    const row = document.createElement("div");
    row.className = "flex gap-2 items-center";
    row.dataset.rowId = "pkgrow" + pkgRowSeq++;
    row.innerHTML = `
      <select class="pkg-item-name flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"></select>
      <input type="number" class="pkg-item-qty w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm" min="1" value="${preset?.qty || 1}" />
      <button type="button" class="pkg-row-remove w-8 h-8 rounded-md border border-rose-300 text-rose-600 hover:bg-rose-600 hover:text-white transition text-xs">✕</button>
    `;
    wrap.appendChild(row);
    DB.getAll("priceList").then((items) => {
      const sel = row.querySelector(".pkg-item-name");
      sel.innerHTML = items.map((i) => `<option value="${escapeHTML(i.name)}">${escapeHTML(i.name)}</option>`).join("");
      if (preset?.name) sel.value = preset.name;
    });
    row.querySelector(".pkg-row-remove").addEventListener("click", () => row.remove());
  }
  document.getElementById("pkg-add-row").addEventListener("click", () => addPkgRow());
  addPkgRow();

  async function renderPackages() {
    const packages = await DB.getAll("packages");
    const wrap = document.getElementById("package-list");
    wrap.innerHTML =
      packages
        .map(
          (pkg) => `<div class="border border-slate-200 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1.5">
          <div class="font-semibold">${escapeHTML(pkg.name)} ${categoryBadgeHTML(pkg.category)}</div>
          <button class="px-2.5 py-1 rounded-md border border-rose-300 text-rose-600 text-xs font-semibold hover:bg-rose-600 hover:text-white transition" data-id="${pkg.id}" data-action="del-pkg">Delete</button>
        </div>
        <div class="text-xs text-slate-500">${pkg.items.map((i) => `${escapeHTML(i.name)} × ${i.qty}`).join(", ")}</div>
      </div>`
        )
        .join("") || `<p class="text-sm text-slate-400">No packages yet.</p>`;
  }

  document.getElementById("package-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("pkg-name").value.trim();
    if (!name) {
      toast("Enter a package name.", "error");
      return;
    }
    const rows = [...document.querySelectorAll("#pkg-items > div")];
    const items = rows
      .map((row) => ({
        name: row.querySelector(".pkg-item-name").value,
        qty: safeNumber(row.querySelector(".pkg-item-qty").value, 1),
      }))
      .filter((i) => i.name);
    if (items.length === 0) {
      toast("Add at least one item to the package.", "error");
      return;
    }
    await DB.add("packages", { name, category: $("pkg-category").value, items });
    e.target.reset();
    document.getElementById("pkg-items").innerHTML = "";
    addPkgRow();
    toast("Package saved.", "success");
    renderPackages();
  });

  document.getElementById("package-list").addEventListener("click", async (e) => {
    if (e.target.dataset.action === "del-pkg") {
      if (!confirm("Delete this package?")) return;
      await DB.delete("packages", Number(e.target.dataset.id));
      renderPackages();
    }
  });

  // ---------- Data Management ----------
  document.getElementById("export-btn").addEventListener("click", async () => {
    const data = {
      exportedAt: new Date().toISOString(),
      settings: await DB.get("settings", 1),
      categories: await DB.getAll("categories"),
      packages: await DB.getAll("packages"),
      priceList: await DB.getAll("priceList"),
      doctors: await DB.getAll("doctors"),
      bills: await DB.getAll("bills"),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hbs-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const s = await DB.get("settings", 1);
    if (s) {
      s.lastBackupAt = new Date().toISOString();
      await DB.put("settings", s);
    }
  });

  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Basic structural validation before touching the database.
      const isValid =
        data &&
        typeof data === "object" &&
        (data.settings === undefined || typeof data.settings === "object") &&
        (data.categories === undefined || Array.isArray(data.categories)) &&
        (data.packages === undefined || Array.isArray(data.packages)) &&
        (data.priceList === undefined || Array.isArray(data.priceList)) &&
        (data.doctors === undefined || Array.isArray(data.doctors)) &&
        (data.bills === undefined || Array.isArray(data.bills));
      if (!isValid) throw new Error("Unrecognised backup file format.");

      if (!confirm("Import will replace current settings/categories/price list/doctors/bills with the file's contents. Continue?")) {
        e.target.value = "";
        return;
      }

      if (data.settings) await DB.put("settings", { ...data.settings, id: 1 });
      if (data.categories) {
        await DB.clearStore("categories");
        for (const c of data.categories) await DB.add("categories", { name: c.name });
      }
      if (data.packages) {
        await DB.clearStore("packages");
        for (const p of data.packages) await DB.add("packages", { name: p.name, category: p.category, items: p.items || [] });
      }
      if (data.priceList) {
        await DB.clearStore("priceList");
        for (const p of data.priceList) await DB.add("priceList", { name: p.name, category: p.category, rate: safeNumber(p.rate), unit: p.unit || "" });
      }
      if (data.doctors) {
        await DB.clearStore("doctors");
        for (const d of data.doctors) await DB.add("doctors", { name: d.name, category: d.category, department: d.department || "", contact: d.contact || "" });
      }
      if (data.bills) {
        await DB.clearStore("bills");
        for (const b of data.bills) await DB.add("bills", b);
      }
      toast("Data imported successfully. Reloading…", "success");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error(err);
      toast("Import failed: " + err.message, "error");
    } finally {
      e.target.value = "";
    }
  });

  document.getElementById("clear-db-btn").addEventListener("click", async () => {
    if ($("confirm-text").value.trim() !== "DELETE") {
      toast('Type DELETE exactly to confirm.', "error");
      return;
    }
    if (!confirm("This will permanently erase ALL hospital billing data. Are you absolutely sure?")) return;
    await DB.destroyDatabase();
    toast("Database cleared. Reloading with fresh sample data…", "success");
    setTimeout(() => window.location.reload(), 1200);
  });

  renderCategories();
  renderPriceList();
  renderDoctors();
  renderPackages();
})();
