(async function () {
  await initPage("dashboard");

  const bills = (await DB.getAll("bills")).filter((b) => b.status !== "void");
  const doctors = await DB.getAll("doctors");
  const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d]));

  const todayStr = new Date().toDateString();
  const billsToday = bills.filter((b) => new Date(b.createdAt).toDateString() === todayStr);
  const revenueToday = billsToday.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalDues = bills.reduce((sum, b) => sum + (b.dueAmount || 0), 0);

  document.getElementById("stat-bills-today").textContent = billsToday.length;
  document.getElementById("stat-revenue-today").textContent = formatCurrency(revenueToday);
  document.getElementById("stat-bills-total").textContent = bills.length;
  const duesEl = document.getElementById("stat-dues");
  if (duesEl) duesEl.textContent = formatCurrency(totalDues);

  const settings = await DB.get("settings", 1);
  if (!settings?.lastBackupAt) {
    toast("No backup on record. Export your data from Settings → Data Management.", "info");
  } else {
    const daysSince = (Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000;
    if (daysSince > 7) toast("It's been over a week since your last backup. Consider exporting from Settings.", "info");
  }

  // Top doctor by patient (bill) count
  const counts = {};
  bills.forEach((b) => {
    if (!b.doctorId) return;
    counts[b.doctorId] = (counts[b.doctorId] || 0) + 1;
  });
  const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  document.getElementById("stat-top-doctor").textContent = topId
    ? `${doctorMap[topId]?.name || "Unknown"} (${counts[topId]})`
    : "No data yet";

  // Recent bills (last 8)
  const recent = [...bills].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  const body = document.getElementById("recent-bills-body");
  if (recent.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="text-center text-slate-400 py-8">No bills generated yet. <a href="new-bill.html" class="text-teal font-semibold">Create your first bill</a>.</td></tr>`;
    return;
  }
  body.innerHTML = recent
    .map((b) => {
      const doc = doctorMap[b.doctorId];
      return `<tr class="border-t border-slate-100 hover:bg-slate-50">
        <td class="py-2.5">${escapeHTML(b.billNo)}</td>
        <td class="py-2.5">${formatDate(b.createdAt)}</td>
        <td class="py-2.5">${escapeHTML(b.patientName)}</td>
        <td class="py-2.5">${doc ? escapeHTML(doc.name) : "—"}</td>
        <td class="py-2.5">${categoryBadgeHTML(b.category)}</td>
        <td class="py-2.5 text-right font-medium">${formatCurrency(b.grandTotal)}</td>
        <td class="py-2.5 text-right"><a href="print-bill.html?id=${b.id}" class="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold hover:border-teal hover:text-teal transition">View</a></td>
      </tr>`;
    })
    .join("");
})();
