(async function () {
  await initPage(null); // keep nav present but no active tab (this is a receipt view, not primary nav)

  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id"));
  const root = document.getElementById("receipt-root");

  if (!id) {
    root.innerHTML = `<div class="text-center text-slate-400 py-10">No bill specified. <a href="bill-history.html" class="text-teal font-semibold">Go to Bill History</a>.</div>`;
    return;
  }

  const bill = await DB.get("bills", id);
  if (!bill) {
    root.innerHTML = `<div class="text-center text-slate-400 py-10">Bill not found. It may have been removed. <a href="bill-history.html" class="text-teal font-semibold">Go to Bill History</a>.</div>`;
    return;
  }
  const settings = (await DB.get("settings", 1)) || {};
  const isVoid = bill.status === "void";

  function receiptInnerHTML(copyLabel) {
    const itemsRows = bill.items
      .map(
        (it, idx) => `<tr>
          <td>${idx + 1}. ${escapeHTML(it.name)}</td>
          <td class="num">${it.qty}</td>
          <td class="num">${formatCurrency(it.rate)}</td>
          <td class="num">${it.discType !== "none" ? "- " + formatCurrency(it.discAmt) : "—"}</td>
          <td class="num">${formatCurrency(it.lineTotal)}</td>
        </tr>`
      )
      .join("");

    const vatLine =
      bill.vatMode && bill.vatMode !== "none"
        ? `<div><span>VAT (${bill.vatRate}% ${bill.vatMode === "inclusive" ? "incl." : "excl."})</span><span>${formatCurrency(bill.vatAmt)}</span></div>`
        : "";

    const paymentBadge =
      bill.paymentStatus === "Paid"
        ? `<span style="color:#1B8A5A;font-weight:700;">PAID</span>`
        : bill.paymentStatus === "Due"
        ? `<span style="color:#C0392B;font-weight:700;">DUE — ${formatCurrency(bill.dueAmount)}</span>`
        : `<span style="color:#B7791F;font-weight:700;">PARTIAL — Due ${formatCurrency(bill.dueAmount)}</span>`;

    return `
      ${copyLabel ? `<div style="text-align:center;font-size:10.5px;font-weight:700;letter-spacing:1px;color:#0F3D5C;margin-bottom:6px;">${copyLabel}</div>` : ""}
      ${isVoid ? `<div style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-25deg);font-size:56px;font-weight:800;color:rgba(192,57,43,0.25);pointer-events:none;letter-spacing:6px;">VOID</div>` : ""}
      <div class="receipt-letterhead">
        <div class="receipt-brand">
          ${settings.logo ? `<img src="${settings.logo}" class="receipt-logo" alt="logo" />` : ""}
          <div>
            <p class="receipt-hospital-name">${escapeHTML(settings.hospitalName || "Hospital Name")}</p>
            <div class="receipt-hospital-meta">
              ${escapeHTML(settings.address || "")}<br/>
              Phone: ${escapeHTML(settings.phone || "-")} &nbsp;|&nbsp; Email: ${escapeHTML(settings.email || "-")}<br/>
              PAN: ${escapeHTML(settings.pan || "-")}
            </div>
          </div>
        </div>
        <div class="receipt-qr-block">
          <div class="qr-canvas"></div>
          <div class="bill-tag">${escapeHTML(bill.billNo)}</div>
          <div>Scan to verify</div>
        </div>
      </div>

      <div class="receipt-billmeta">
        <div>
          <div class="billno">Bill No: ${escapeHTML(bill.billNo)}</div>
          <div>Category: ${escapeHTML(bill.category)}</div>
        </div>
        <div style="text-align:right;">
          <div><strong>Date:</strong> ${formatDate(bill.createdAt)}</div>
          <div><strong>Doctor:</strong> ${escapeHTML(bill.doctorName || "N/A")}</div>
        </div>
      </div>

      <div class="receipt-patient">
        <div><strong>Patient:</strong> ${escapeHTML(bill.patientName)}</div>
        <div><strong>Age / Gender:</strong> ${escapeHTML(bill.age)} / ${escapeHTML(bill.gender)}</div>
        <div><strong>Address:</strong> ${escapeHTML(bill.address || "-")}</div>
        <div><strong>Phone:</strong> ${escapeHTML(bill.phone || "-")}</div>
      </div>

      <table class="receipt-items">
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">Amount</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <div class="receipt-totals">
        <div><span>Subtotal</span><span>${formatCurrency(bill.subtotal)}</span></div>
        <div><span>Item Discounts</span><span>- ${formatCurrency(bill.itemDiscTotal)}</span></div>
        <div><span>Bill Discount</span><span>- ${formatCurrency(bill.billDiscAmt)}</span></div>
        ${vatLine}
        <div class="grand"><span>Grand Total</span><span>${formatCurrency(bill.grandTotal)}</span></div>
      </div>

      <div style="font-size:12.5px;margin-top:12px;display:flex;justify-content:space-between;">
        <div>Payment Method: <strong>${escapeHTML(bill.paymentMethod || "-")}</strong></div>
        <div>Status: ${paymentBadge}</div>
      </div>

      ${
        isVoid
          ? `<div style="margin-top:14px;padding:10px 12px;border:1px solid #C0392B;border-radius:6px;font-size:12px;color:#C0392B;">
               <strong>VOIDED</strong> on ${formatDate(bill.voidAt)} by ${escapeHTML(bill.voidBy || "-")}<br/>
               Reason: ${escapeHTML(bill.voidReason || "-")}
             </div>`
          : ""
      }

      <div class="receipt-footer" style="justify-content:flex-end;">
        <div class="receipt-signature">
          <div class="line"></div>
          ${escapeHTML(settings.signatoryName || "Authorised Signatory")}
        </div>
      </div>

      <div class="receipt-note">${escapeHTML(settings.footerNote || "")}</div>
    `;
  }

  function renderSingleView() {
    root.innerHTML = `<div style="position:relative;">${receiptInnerHTML(null)}</div>`;
    root.classList.remove("receipt-double", "receipt-page-landscape");
    root.classList.add("receipt-single");
    renderAllQRCodes();
  }

  function renderAllQRCodes() {
    document.querySelectorAll(".qr-canvas").forEach((el) => {
      el.innerHTML = "";
      if (window.QRCode) {
        const qrText = `Bill:${bill.billNo}|Date:${bill.createdAt}|Patient:${bill.patientName}|Amount:${bill.grandTotal.toFixed(2)}|Hospital:${settings.hospitalName || ""}`;
        new QRCode(el, { text: qrText, width: 74, height: 74, correctLevel: QRCode.CorrectLevel.M });
      } else {
        el.textContent = "(QR unavailable offline)";
      }
    });
  }

  // Initial render on load
  renderSingleView();

  // Single Copy (Portrait) Print Button
  const printBtn = document.getElementById("print-btn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      renderSingleView();
      setTimeout(() => window.print(), 150);
    });
  }

  // Double Copy (Landscape 2-Up) Print Button
  const print2upBtn = document.getElementById("print-2up-btn");
  if (print2upBtn) {
    print2upBtn.addEventListener("click", () => {
      root.innerHTML = `
        <div class="receipt-double-container">
          <div class="receipt-half-column" style="position:relative; border-right:1px dashed #999; padding-right:20px;">
            ${receiptInnerHTML("PATIENT COPY")}
          </div>
          <div class="receipt-half-column" style="position:relative; padding-left:4px;">
            ${receiptInnerHTML("HOSPITAL COPY")}
          </div>
        </div>`;

      root.classList.remove("receipt-single");
      root.classList.add("receipt-double", "receipt-page-landscape");

      renderAllQRCodes();
      setTimeout(() => window.print(),100);
    });
  }

  // Restore single portrait view after printing closes
 /* window.addEventListener("afterprint", () => {
    if (root.classList.contains("receipt-double")) {
     setTimeout(() =>  renderSingleView(),20000);
    }
  });*/
})();