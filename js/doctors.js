(async function () {
  await initPage("doctors");

  const doctors = await DB.getAll("doctors");
  const bills = (await DB.getAll("bills")).filter((b) => b.status !== "void");

  const stats = doctors.map((d) => {
    const docBills = bills.filter((b) => b.doctorId === d.id);
    const revenue = docBills.reduce((s, b) => s + b.grandTotal, 0);
    const commissionPercent = safeNumber(d.commissionPercent, 0);
    return {
      ...d,
      patientCount: docBills.length,
      revenue,
      commission: (revenue * commissionPercent) / 100,
    };
  });

  const sortMode = document.getElementById("sort-mode");
  const barsWrap = document.getElementById("bars-wrap");
  const detailBody = document.getElementById("detail-body");

  function render() {
    const key = sortMode.value === "revenue" ? "revenue" : "patientCount";
    const sorted = [...stats].sort((a, b) => b[key] - a[key]);
    const max = Math.max(1, ...sorted.map((s) => s[key]));

    if (sorted.length === 0) {
      barsWrap.innerHTML = `<div class="text-center text-slate-400 py-8">No doctors added yet. Add some in Settings.</div>`;
    } else {
      barsWrap.innerHTML = sorted
        .map((s) => {
          const widthPct = Math.round((s[key] / max) * 100);
          const displayVal = key === "revenue" ? formatCurrency(s.revenue) : s.patientCount + " patients";
          return `<div class="grid grid-cols-[140px_1fr_100px] sm:grid-cols-[180px_1fr_110px] items-center gap-3 mb-2.5 text-sm">
            <div class="truncate font-medium">${escapeHTML(s.name)}</div>
            <div class="bg-slate-100 rounded-full h-3.5 overflow-hidden"><div class="bg-teal h-full rounded-full" style="width:${widthPct}%;"></div></div>
            <div class="text-right text-slate-600">${displayVal}</div>
          </div>`;
        })
        .join("");
    }

    detailBody.innerHTML =
      sorted
        .map(
          (s) => `<tr class="border-t border-slate-100 hover:bg-slate-50">
        <td class="py-2.5">${escapeHTML(s.name)}${s.active === false ? ' <span class="text-xs text-slate-400">(inactive)</span>' : ""}</td>
        <td class="py-2.5">${escapeHTML(s.department)}</td>
        <td class="py-2.5">${categoryBadgeHTML(s.category)}</td>
        <td class="py-2.5 text-right">${s.patientCount}</td>
        <td class="py-2.5 text-right font-medium">${formatCurrency(s.revenue)}</td>
        <td class="py-2.5 text-right">${s.commissionPercent || 0}%</td>
        <td class="py-2.5 text-right font-medium text-teal-dark">${formatCurrency(s.commission)}</td>
      </tr>`
        )
        .join("") || `<tr><td colspan="7" class="text-center text-slate-400 py-8">No data.</td></tr>`;
  }

  sortMode.addEventListener("change", render);
  render();
})();
