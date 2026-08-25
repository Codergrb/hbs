(async function () {
  await initPage("new-bill");

  const priceList = (await DB.getAll("priceList")).filter((p) => p.active !== false);
  const doctors = (await DB.getAll("doctors")).filter((d) => d.active !== false);
  const packages = await DB.getAll("packages");

  const itemsBody = document.getElementById("items-body");
  const categorySelect = document.getElementById("v-category");
  const doctorSelect = document.getElementById("v-doctor");
  const billDiscType = document.getElementById("bill-disc-type");
  const billDiscValue = document.getElementById("bill-disc-value");
  const vatMode = document.getElementById("vat-mode");
  const payStatus = document.getElementById("pay-status");
  const payAmount = document.getElementById("pay-amount");
  let rowSeq = 0;

  await populateCategorySelect(categorySelect, { blankLabel: "Select" });

  const packageSelect = document.getElementById("package-select");
  packageSelect.innerHTML =
    `<option value="">Select a package…</option>` +
    packages.map((p) => `<option value="${p.id}">${escapeHTML(p.name)} (${p.items.length} items)</option>`).join("");

  function priceOptionsHTML() {
    const byCategory = {};
    priceList.forEach((p) => {
      byCategory[p.category] = byCategory[p.category] || [];
      byCategory[p.category].push(p);
    });
    return Object.keys(byCategory)
      .map(
        (cat) =>
          `<optgroup label="${escapeHTML(cat)}">` +
          byCategory[cat]
            .map((p) => `<option value="${p.id}" data-rate="${p.rate}">${escapeHTML(p.name)} (${formatCurrency(p.rate)})</option>`)
            .join("") +
          `</optgroup>`
      )
      .join("");
  }

  function addItemRow(preset) {
    const id = "row" + rowSeq++;
    const tr = document.createElement("tr");
    tr.dataset.rowId = id;
    tr.className = "border-t border-slate-100";
    const inputCls = "px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal";
    tr.innerHTML = `
      <td class="py-2 pr-2">
        <select class="item-select ${inputCls} w-full">
          <option value="">Select item…</option>
          ${priceOptionsHTML()}
        </select>
      </td>
      <td class="py-2 pr-2"><input type="number" class="item-qty ${inputCls}" min="1" value="${preset?.qty || 1}" style="width:70px;" /></td>
      <td class="py-2 pr-2"><input type="number" class="item-rate ${inputCls}" min="0" step="0.01" value="0" style="width:100px;" /></td>
      <td class="py-2 pr-2">
        <div class="flex gap-1">
          <select class="item-disc-type ${inputCls}" style="width:62px;">
            <option value="none">–</option>
            <option value="percent">%</option>
            <option value="amount">Rs</option>
          </select>
          <input type="number" class="item-disc-value ${inputCls}" min="0" step="0.01" value="0" style="width:64px;" />
        </div>
      </td>
      <td class="py-2 pr-2 text-right font-medium item-line-total">Rs. 0.00</td>
      <td class="py-2"><button type="button" class="remove-row w-7 h-7 rounded-md border border-rose-300 text-rose-600 hover:bg-rose-600 hover:text-white transition text-xs">✕</button></td>
    `;
    itemsBody.appendChild(tr);

    if (preset?.priceListId) {
      const select = tr.querySelector(".item-select");
      select.value = String(preset.priceListId);
      const opt = select.selectedOptions[0];
      tr.querySelector(".item-rate").value = opt?.dataset.rate || 0;
    }

    tr.querySelector(".item-select").addEventListener("change", (e) => {
      const opt = e.target.selectedOptions[0];
      tr.querySelector(".item-rate").value = opt?.dataset.rate || 0;
      recalc();
    });
    tr.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", recalc));
    tr.querySelector(".remove-row").addEventListener("click", () => {
      tr.remove();
      recalc();
    });
  }

  document.getElementById("add-item-btn").addEventListener("click", () => addItemRow());
  addItemRow(); // start with one row

  document.getElementById("add-package-btn").addEventListener("click", () => {
    const pkg = packages.find((p) => p.id === Number(packageSelect.value));
    if (!pkg) {
      toast("Select a package first.", "error");
      return;
    }
    let matched = 0;
    pkg.items.forEach((it) => {
      const priceItem = priceList.find((p) => p.name === it.name);
      if (priceItem) {
        addItemRow({ priceListId: priceItem.id, qty: it.qty });
        matched++;
      }
    });
    if (matched === 0) {
      toast("None of this package's items were found in the active price list.", "error");
    } else {
      toast(`Added ${matched} item(s) from "${pkg.name}".`, "success");
      recalc();
    }
  });

  categorySelect.addEventListener("change", () => {
    const cat = categorySelect.value;
    const filtered = cat ? doctors.filter((d) => d.category === cat) : doctors;
    doctorSelect.innerHTML =
      `<option value="">N/A — No doctor</option>` +
      filtered.map((d) => `<option value="${d.id}">${escapeHTML(d.name)} — ${escapeHTML(d.department)}</option>`).join("");
  });

  billDiscType.addEventListener("change", () => {
    billDiscValue.disabled = billDiscType.value === "none";
    if (billDiscType.value === "none") billDiscValue.value = 0;
    recalc();
  });
  billDiscValue.addEventListener("input", recalc);

  vatMode.addEventListener("change", () => {
    document.getElementById("vat-rate").disabled = vatMode.value === "none";
    recalc();
  });

  payStatus.addEventListener("change", () => {
    if (payStatus.value === "Paid") {
      payAmount.disabled = true;
    } else if (payStatus.value === "Due") {
      payAmount.disabled = true;
      payAmount.value = 0;
    } else {
      payAmount.disabled = false;
    }
    recalc();
  });
  document.getElementById("vat-rate").addEventListener("input", recalc);

  function computeLine(tr) {
    const qty = safeNumber(tr.querySelector(".item-qty").value, 0);
    const rate = safeNumber(tr.querySelector(".item-rate").value, 0);
    const discType = tr.querySelector(".item-disc-type").value;
    const discVal = safeNumber(tr.querySelector(".item-disc-value").value, 0);
    const lineSubtotal = qty * rate;
    let discAmt = 0;
    if (discType === "percent") discAmt = (lineSubtotal * Math.min(discVal, 100)) / 100;
    else if (discType === "amount") discAmt = Math.min(discVal, lineSubtotal);
    const lineTotal = Math.max(0, lineSubtotal - discAmt);
    tr.querySelector(".item-line-total").textContent = formatCurrency(lineTotal);
    return { lineSubtotal, discAmt, lineTotal };
  }

  function computeVAT(afterDiscount) {
    const rate = safeNumber(document.getElementById("vat-rate").value, 13);
    if (vatMode.value === "exclusive") {
      const vatAmt = (afterDiscount * rate) / 100;
      return { vatAmt, grand: afterDiscount + vatAmt };
    }
    if (vatMode.value === "inclusive") {
      const vatAmt = afterDiscount - afterDiscount / (1 + rate / 100);
      return { vatAmt, grand: afterDiscount };
    }
    return { vatAmt: 0, grand: afterDiscount };
  }

  function recalc() {
    let subtotal = 0,
      itemDiscTotal = 0;
    itemsBody.querySelectorAll("tr").forEach((tr) => {
      const { lineSubtotal, discAmt } = computeLine(tr);
      subtotal += lineSubtotal;
      itemDiscTotal += discAmt;
    });
    const afterItemDisc = subtotal - itemDiscTotal;

    let billDiscAmt = 0;
    if (billDiscType.value === "percent") billDiscAmt = (afterItemDisc * Math.min(safeNumber(billDiscValue.value), 100)) / 100;
    else if (billDiscType.value === "amount") billDiscAmt = Math.min(safeNumber(billDiscValue.value), afterItemDisc);

    const afterBillDisc = Math.max(0, afterItemDisc - billDiscAmt);
    const { vatAmt, grand } = computeVAT(afterBillDisc);

    document.getElementById("sum-subtotal").textContent = formatCurrency(subtotal);
    document.getElementById("sum-item-disc").textContent = "- " + formatCurrency(itemDiscTotal);
    document.getElementById("sum-bill-disc").textContent = "- " + formatCurrency(billDiscAmt);
    document.getElementById("sum-vat").textContent = (vatMode.value === "none" ? "" : vatMode.value === "inclusive" ? "(incl.) " : "+ ") + formatCurrency(vatAmt);
    document.getElementById("sum-grand").textContent = formatCurrency(grand);

    if (payStatus.value === "Paid") payAmount.value = grand.toFixed(2);
    if (payStatus.value === "Due") payAmount.value = 0;
  }

  document.getElementById("reset-btn").addEventListener("click", () => {
    document.getElementById("bill-form").reset();
    itemsBody.innerHTML = "";
    addItemRow();
    billDiscValue.disabled = true;
    document.getElementById("vat-rate").disabled = true;
    payAmount.disabled = true;
    recalc();
  });

  document.getElementById("bill-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("save-btn");

    const patientName = document.getElementById("p-name").value.trim();
    const age = safeNumber(document.getElementById("p-age").value, -1);
    const gender = document.getElementById("p-gender").value;
    const category = categorySelect.value;

    if (!patientName || age < 0 || !gender || !category) {
      toast("Please complete all required patient/visit fields.", "error");
      return;
    }

    const rows = [...itemsBody.querySelectorAll("tr")];
    if (rows.length === 0) {
      toast("Add at least one billed item.", "error");
      return;
    }
    const items = [];
    for (const tr of rows) {
      const select = tr.querySelector(".item-select");
      const opt = select.selectedOptions[0];
      if (!select.value) {
        toast("Every item row needs an item selected.", "error");
        return;
      }
      const { lineSubtotal, discAmt, lineTotal } = computeLine(tr);
      items.push({
        priceListId: Number(select.value),
        name: opt.textContent.replace(/\s*\(Rs\..*\)$/, ""),
        qty: safeNumber(tr.querySelector(".item-qty").value, 1),
        rate: safeNumber(tr.querySelector(".item-rate").value, 0),
        discType: tr.querySelector(".item-disc-type").value,
        discValue: safeNumber(tr.querySelector(".item-disc-value").value, 0),
        lineSubtotal,
        discAmt,
        lineTotal,
      });
    }

    const subtotal = items.reduce((s, i) => s + i.lineSubtotal, 0);
    const itemDiscTotal = items.reduce((s, i) => s + i.discAmt, 0);
    const afterItemDisc = subtotal - itemDiscTotal;
    let billDiscAmt = 0;
    if (billDiscType.value === "percent") billDiscAmt = (afterItemDisc * Math.min(safeNumber(billDiscValue.value), 100)) / 100;
    else if (billDiscType.value === "amount") billDiscAmt = Math.min(safeNumber(billDiscValue.value), afterItemDisc);
    const afterBillDisc = Math.max(0, afterItemDisc - billDiscAmt);
    const { vatAmt, grand: grandTotal } = computeVAT(afterBillDisc);

    const doctorId = doctorSelect.value ? Number(doctorSelect.value) : null;
    const doctor = doctorId ? doctors.find((d) => d.id === doctorId) : null;

    const settings = await DB.get("settings", 1);
    const bsYear = settings?.bsYear || suggestBSYear();

    let amountPaid = safeNumber(payAmount.value, 0);
    if (payStatus.value === "Paid") amountPaid = grandTotal;
    if (payStatus.value === "Due") amountPaid = 0;
    amountPaid = Math.min(amountPaid, grandTotal);

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const billNo = await DB.nextBillNo(bsYear);
      const bill = {
        billNo,
        bsYear,
        createdAt: new Date().toISOString(),
        patientName,
        age,
        gender,
        address: document.getElementById("p-address").value.trim(),
        phone: document.getElementById("p-phone").value.trim(),
        category,
        doctorId,
        doctorName: doctor ? doctor.name : "N/A",
        doctorCommissionPercent: doctor ? safeNumber(doctor.commissionPercent, 0) : 0,
        items,
        subtotal,
        itemDiscTotal,
        billDiscType: billDiscType.value,
        billDiscValue: safeNumber(billDiscValue.value, 0),
        billDiscAmt,
        vatMode: vatMode.value,
        vatRate: safeNumber(document.getElementById("vat-rate").value, 13),
        vatAmt,
        grandTotal,
        paymentStatus: payStatus.value,
        paymentMethod: document.getElementById("pay-method").value,
        amountPaid,
        dueAmount: Math.max(0, grandTotal - amountPaid),
        status: "active",
      };
      const newId = await DB.add("bills", bill);
      toast("Bill registered successfully.", "success");
      window.location.href = "print-bill.html?id=" + newId;
    } catch (err) {
      console.error(err);
      toast("Could not save the bill. Please try again.", "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Register Bill";
    }
  });

  recalc();
})();
