(async function () {
  await initPage("history");

  const bills = await DB.getAll("bills");
  const doctors = await DB.getAll("doctors");
  const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d]));

  const doctorFilter = document.getElementById("f-doctor");
  doctorFilter.innerHTML += doctors.map((d) => `<option value="${d.id}">${escapeHTML(d.name)}</option>`).join("");

  const categoryFilterEl = document.getElementById("f-category");
  const categories = await DB.getAll("categories");
  categoryFilterEl.innerHTML += categories.map((c) => `<option>${escapeHTML(c.name)}</option>`).join("");

  const searchInput = document.getElementById("f-search");
  const categoryFilter = document.getElementById("f-category");
  const body = document.getElementById("history-body");

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;
    const docId = doctorFilter.value;

    let rows = [...bills].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (q) rows = rows.filter((b) => b.billNo.toLowerCase().includes(q) || b.patientName.toLowerCase().includes(q));
    if (cat) rows = rows.filter((b) => b.category === cat);
    if (docId) rows = rows.filter((b) => String(b.doctorId) === docId);

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="8" class="text-center text-slate-400 py-8">No bills match your filters.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map((b) => {
        const doc = doctorMap[b.doctorId];
        const isVoid = b.status === "void";
        const payColor = b.paymentStatus === "Paid" ? "text-emerald-600" : b.paymentStatus === "Due" ? "text-rose-600" : "text-amber-600";
        return `<tr class="border-t border-slate-100 hover:bg-slate-50 ${isVoid ? "opacity-50" : ""}">
          <td class="py-2.5">${escapeHTML(b.billNo)}${isVoid ? ' <span class="text-xs font-bold text-rose-600">VOID</span>' : ""}</td>
          <td class="py-2.5">${formatDate(b.createdAt)}</td>
          <td class="py-2.5">${escapeHTML(b.patientName)}</td>
          <td class="py-2.5">${doc ? escapeHTML(doc.name) : "N/A"}</td>
          <td class="py-2.5">${categoryBadgeHTML(b.category)}</td>
          <td class="py-2.5 text-xs font-semibold ${payColor}">${escapeHTML(b.paymentStatus || "-")}</td>
          <td class="py-2.5 text-right font-medium">${formatCurrency(b.grandTotal)}</td>
          <td class="py-2.5 text-right whitespace-nowrap">
            <a href="print-bill.html?id=${b.id}" class="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold hover:border-teal hover:text-teal transition mr-1">View</a>
            ${!isVoid ? `<button class="px-3 py-1.5 rounded-md border border-rose-300 text-rose-600 text-xs font-semibold hover:bg-rose-600 hover:text-white transition" data-id="${b.id}" data-action="void-bill">Void</button>` : ""}
          </td>
        </tr>`;
      })
      .join("");
  }

  async function renderDues() {
    const duesCard = document.getElementById("dues-card");
    const due = bills.filter((b) => b.status !== "void" && (b.paymentStatus === "Due" || b.paymentStatus === "Partial") && b.dueAmount > 0);
    if (due.length === 0) {
      duesCard.classList.add("hidden");
      return;
    }
    duesCard.classList.remove("hidden");
    document.getElementById("dues-body").innerHTML = due
      .sort((a, b2) => b2.dueAmount - a.dueAmount)
      .map(
        (b) => `<tr class="border-t border-slate-100">
        <td class="py-2">${escapeHTML(b.billNo)}</td>
        <td class="py-2">${escapeHTML(b.patientName)}</td>
        <td class="py-2 text-amber-600 font-semibold">${escapeHTML(b.paymentStatus)}</td>
        <td class="py-2 text-right font-semibold text-rose-600">${formatCurrency(b.dueAmount)}</td>
        <td class="py-2 text-right"><button class="px-3 py-1.5 rounded-md border border-emerald-300 text-emerald-700 text-xs font-semibold hover:bg-emerald-600 hover:text-white transition" data-id="${b.id}" data-action="mark-paid">Mark Paid</button></td>
      </tr>`
      )
      .join("");
  }

  document.getElementById("history-body").addEventListener("click", async (e) => {
    const id = Number(e.target.dataset.id);
    if (e.target.dataset.action === "void-bill") {
      const reason = prompt("Reason for voiding this bill:");
      if (reason === null || !reason.trim()) return;
      const authorizer = prompt("Authorised by (name):");
      if (authorizer === null || !authorizer.trim()) return;
      const bill = await DB.get("bills", id);
      bill.status = "void";
      bill.voidReason = reason.trim();
      bill.voidBy = authorizer.trim();
      bill.voidAt = new Date().toISOString();
      await DB.put("bills", bill);
      Object.assign(bills.find((b) => b.id === id), bill);
      toast("Bill voided.", "success");
      render();
      renderDues();
    }
  });

  document.getElementById("dues-body").addEventListener("click", async (e) => {
    if (e.target.dataset.action === "mark-paid") {
      const id = Number(e.target.dataset.id);
      const bill = await DB.get("bills", id);
      bill.paymentStatus = "Paid";
      bill.amountPaid = bill.grandTotal;
      bill.dueAmount = 0;
      await DB.put("bills", bill);
      Object.assign(bills.find((b) => b.id === id), bill);
      toast("Marked as paid.", "success");
      render();
      renderDues();
    }
  });

  [searchInput, categoryFilter, doctorFilter].forEach((el) => el.addEventListener("input", render));
  render();
  renderDues();
})();
