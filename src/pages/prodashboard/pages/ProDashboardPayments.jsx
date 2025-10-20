import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Download, FileText, CheckCircle, XCircle, Clock } from "lucide-react";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ProDashboardPayments() {
  const { session } = useUser();
  const proId = session?.user?.id;
  const proName = session?.user?.user_metadata?.name || "Professional";
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState("month");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!proId) return;
    fetchPayments();
  }, [proId, filter]);

  const fetchPayments = async () => {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("pro_id", proId)
      .order("created_at", { ascending: false });

    if (error) return console.error(error);

    const now = dayjs();
    const filtered = data.filter((p) => {
      const date = dayjs(p.created_at);
      if (filter === "week") return date.isAfter(now.subtract(7, "day"));
      if (filter === "month") return date.isAfter(now.startOf("month"));
      if (filter === "year") return date.isAfter(now.startOf("year"));
      return true;
    });

    setPayments(filtered);
    setTotal(filtered.reduce((acc, p) => acc + (p.amount || 0), 0));
  };

  /* ----------------------------- 🎨 Glossed Branding Helpers ----------------------------- */
  const glossedHeader = (doc, title) => {
    // Logo text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(225, 29, 72); // rose-600
    doc.text("Glossed", 14, 20);

    // Title
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.text(title, 14, 30);

    // Gradient line (simulation)
    doc.setDrawColor(225, 29, 72);
    doc.line(14, 34, 196, 34);
  };

  const glossedFooter = (doc) => {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("This document was generated automatically by Glossed – www.glossed.app", 14, 285);
  };

  /* ----------------------------- 🧾 Rapport PDF Global ----------------------------- */
  /* ----------------------------- 🧾 Rapport PDF Global ----------------------------- */
  const handleDownloadReport = () => {
    const doc = new jsPDF();

    // --- En-tête stylé Glossed ---
    glossedHeader(doc, "Payments Report");

    doc.setFontSize(12);
    doc.text(
      `Period: ${filter.toUpperCase()} | Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      14,
      42
    );

    // --- Cas 1 : paiements trouvés ---
    if (payments.length > 0) {
      const tableData = payments.map((p) => [
        p.id.slice(0, 8),
        `${p.amount.toFixed(2)} €`,
        p.status,
        p.mission_id || "—",
        dayjs(p.created_at).format("DD/MM/YYYY"),
      ]);

      autoTable(doc, {
        startY: 50,
        head: [["Payment ID", "Amount", "Status", "Mission", "Date"]],
        body: tableData,
        styles: { fontSize: 10 },
        headStyles: {
          fillColor: [225, 29, 72],
          textColor: [255, 255, 255],
        },
        alternateRowStyles: { fillColor: [255, 240, 245] },
      });

      // --- Total ---
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(`Total: ${total.toFixed(2)} €`, 14, doc.lastAutoTable.finalY + 12);
    }

    // --- Cas 2 : aucun paiement ---
    else {
      doc.setFontSize(13);
      doc.setTextColor(120);
      doc.text("No payments found for this period.", 14, 60);

      doc.setFontSize(11);
      doc.setTextColor(150);
      doc.text(
        "Try adjusting your filter (week, month, year) or verify your account activity.",
        14,
        70
      );
    }

    // --- Pied de page ---
    glossedFooter(doc);

    // --- Téléchargement ---
    doc.save(`Glossed_Payments_${filter}_${dayjs().format("YYYYMMDD")}.pdf`);
  };

  /* ----------------------------- 🧾 Facture PDF Individuelle ----------------------------- */
  const handleDownloadInvoice = (p) => {
    const doc = new jsPDF();

    glossedHeader(doc, "Invoice");

    doc.setFontSize(11);
    doc.text(`Invoice ID: ${p.id}`, 14, 45);
    doc.text(`Date: ${dayjs(p.created_at).format("DD/MM/YYYY")}`, 14, 52);
    doc.text(`Professional: ${proName}`, 14, 59);
    doc.text(`Mission ID: ${p.mission_id || "—"}`, 14, 66);

    // Montant encadré
    doc.setFillColor(255, 235, 240);
    doc.roundedRect(14, 78, 70, 20, 3, 3, "F");
    doc.setFontSize(14);
    doc.setTextColor(225, 29, 72);
    doc.text(`${p.amount.toFixed(2)} €`, 24, 91);

    // Statut
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.text(`Status: ${p.status}`, 14, 110);

    glossedFooter(doc);
    doc.save(`Glossed_Invoice_${p.id.slice(0, 8)}.pdf`);
  };

  /* ----------------------------- Icons ----------------------------- */
  const getStatusIcon = (status) => {
    switch (status) {
      case "paid":
        return <CheckCircle className="text-green-500" size={18} />;
      case "pending":
        return <Clock className="text-amber-500" size={18} />;
      default:
        return <XCircle className="text-gray-400" size={18} />;
    }
  };

  /* ----------------------------- Rendu ----------------------------- */
  return (
    <section className="mt-10 max-w-4xl mx-auto px-4 sm:px-6 md:px-8 space-y-10">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Payments Overview</h1>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white shadow-sm rounded-xl p-4 border border-gray-100">
        <div className="flex items-center gap-3">
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
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-sm">Total</p>
          <p className="text-2xl font-bold text-gray-800">{total.toFixed(2)} €</p>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Payments</h2>

        {payments.length ? (
          <ul className="divide-y divide-gray-100">
            {payments.map((p) => (
              <li
                key={p.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-gray-800">{p.amount.toFixed(2)} €</p>
                  <p className="text-sm text-gray-500">
                    {dayjs(p.created_at).format("DD MMM YYYY")}
                  </p>
                  <p className="text-xs text-gray-400 italic">
                    Linked to mission: {p.mission_id || "—"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-sm font-medium text-gray-600">
                    {getStatusIcon(p.status)}
                    {p.status}
                  </span>

                  <button
                    onClick={() => handleDownloadInvoice(p)}
                    className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition"
                    title="Download invoice"
                  >
                    <FileText size={18} className="text-gray-700" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm text-center italic">
            No payments found for this period.
          </p>
        )}
      </div>

      {/* Rapport PDF */}
      <div className="text-center">
        <button
          onClick={handleDownloadReport}
          className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-medium shadow hover:shadow-md hover:scale-[1.02] transition-transform flex items-center gap-2 mx-auto"
        >
          <Download size={18} /> Download PDF Report
        </button>
      </div>
    </section>
  );
}
