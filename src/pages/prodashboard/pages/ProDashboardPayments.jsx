// 📄 src/pages/prodashboard/pages/ProDashboardPayments.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";

import { Download, FileText, CheckCircle, XCircle, Clock, TrendingUp, Wallet } from "lucide-react";

import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ProDashboardPayments() {
  const { session } = useUser();
  const proId = session?.user?.id;

  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState("month");
  const [total, setTotal] = useState(0);

  const [view, setView] = useState("payments"); // payments | payouts

  /* ------------------------------------------------------------------
     🔁 Charger paiements
  ------------------------------------------------------------------ */
  const fetchPayments = async () => {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("pro_id", proId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Payments fetch error:", error);
      return;
    }

    // Filtre date
    const now = dayjs();
    const filtered = (data || []).filter((p) => {
      const d = dayjs(p.created_at);
      if (filter === "week") return d.isAfter(now.subtract(7, "day"));
      if (filter === "month") return d.isAfter(now.startOf("month"));
      if (filter === "year") return d.isAfter(now.startOf("year"));
      return true;
    });

    setPayments(filtered);

    // Total NET reçu (90 %)
    const totalEuros = filtered.reduce((acc, p) => acc + (p.amount || 0), 0);
    setTotal(totalEuros);
  };

  /* ------------------------------------------------------------------
     📡 Realtime
  ------------------------------------------------------------------ */
  useEffect(() => {
    if (!proId) return;

    fetchPayments();

    const channel = supabase
      .channel(`payments_pro_${proId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payments", filter: `pro_id=eq.${proId}` },
        (payload) => {
          console.log("💸 New payment:", payload.new);
          fetchPayments();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [proId, filter]);

  /* ------------------------------------------------------------------
     🧾 PDF rapport global
  ------------------------------------------------------------------ */
  const handleDownloadReport = () => {
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(225, 29, 72);
    doc.text("Glossed", 14, 20);

    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text("Payments Report", 14, 30);

    doc.setFontSize(12);
    doc.text(
      `Period: ${filter.toUpperCase()} — Generated ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      14,
      42
    );

    const tableData = payments.map((p) => [
      p.id.slice(0, 8),
      p.amount.toFixed(2) + " €",
      p.application_fee ? p.application_fee.toFixed(2) + " €" : "—",
      p.status,
      p.mission_id || "—",
      dayjs(p.created_at).format("DD/MM/YYYY"),
    ]);

    autoTable(doc, {
      startY: 50,
      head: [["ID", "Amount", "Fee", "Status", "Mission", "Date"]],
      body: tableData,
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 240, 245] },
    });

    doc.save(`Glossed_Payments_${filter}.pdf`);
  };

  /* ------------------------------------------------------------------
     🧾 Facture PDF individuelle
  ------------------------------------------------------------------ */
  const handleDownloadInvoice = (p) => {
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(24);
    doc.text("Glossed Invoice", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);

    doc.text(`Invoice ID: ${p.id}`, 14, 40);
    doc.text(`Date: ${dayjs(p.created_at).format("DD/MM/YYYY")}`, 14, 48);
    doc.text(`Mission: ${p.mission_id}`, 14, 56);

    doc.text(`Amount: ${p.amount.toFixed(2)} €`, 14, 70);
    if (p.application_fee) doc.text(`Platform fee: ${p.application_fee} €`, 14, 78);

    doc.save(`Invoice_${p.id}.pdf`);
  };

  /* ------------------------------------------------------------------
     🧱 UI
  ------------------------------------------------------------------ */
  return (
    <section className="mt-10 max-w-4xl mx-auto px-4 space-y-10">
      <h1 className="text-2xl font-bold text-center text-gray-800">Payments & Payouts</h1>

      {/* TABS */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => setView("payments")}
          className={`px-4 py-2 rounded-full font-medium ${
            view === "payments"
              ? "bg-gradient-to-r from-rose-600 to-red-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          Payments
        </button>

        <button
          onClick={() => setView("payouts")}
          className={`px-4 py-2 rounded-full font-medium ${
            view === "payouts"
              ? "bg-gradient-to-r from-rose-600 to-red-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          Payouts
        </button>
      </div>

      {/* ---------------------------- PAYMENTS VIEW ---------------------------- */}
      {view === "payments" && (
        <>
          {/* FILTERS */}
          <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex gap-2">
              {["week", "month", "year", "total"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    filter === f
                      ? "bg-gradient-to-r from-rose-600 to-red-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="text-right">
              <p className="text-gray-500 text-sm">Total received</p>
              <p className="text-2xl font-bold">{total.toFixed(2)} €</p>
            </div>
          </div>

          {/* LIST */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Payments</h2>

            {payments.length === 0 ? (
              <p className="text-gray-500 italic text-center">No payments found.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <li key={p.id} className="py-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-gray-800">{p.amount.toFixed(2)} €</p>
                      <p className="text-sm text-gray-500">
                        {dayjs(p.created_at).format("DD MMM YYYY")}
                      </p>
                      {p.application_fee && (
                        <p className="text-xs text-gray-400">
                          Fee: {p.application_fee.toFixed(2)} €
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {p.status === "paid" ? (
                        <CheckCircle className="text-green-500" size={18} />
                      ) : (
                        <Clock className="text-amber-500" size={18} />
                      )}

                      <button
                        onClick={() => handleDownloadInvoice(p)}
                        className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
                      >
                        <FileText size={18} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* PDF EXPORT */}
          <div className="text-center">
            <button
              onClick={handleDownloadReport}
              className="px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-medium shadow-md hover:scale-[1.03] transition"
            >
              <Download size={18} className="inline-block mr-2" />
              Download Report
            </button>
          </div>
        </>
      )}

      {/* ---------------------------- PAYOUTS VIEW ---------------------------- */}
      {view === "payouts" && (
        <div className="bg-white p-6 rounded-xl shadow border space-y-3 text-center">
          <Wallet size={42} className="mx-auto text-rose-600" />
          <h2 className="text-xl font-bold text-gray-800">Stripe Payouts</h2>
          <p className="text-gray-500">Your payouts are handled automatically by Stripe Express.</p>

          <p className="text-sm text-gray-400">
            (In v2, you pourrez afficher l’historique complet des virements.)
          </p>
        </div>
      )}
    </section>
  );
}
