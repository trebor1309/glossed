// 📄 src/pages/prodashboard/pages/ProDashboardPayments.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";

import { Download, FileText, Eye, CheckCircle, XCircle, Clock, Wallet } from "lucide-react";

import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import PaymentDetailsModal from "@/components/modals/PaymentDetailsModal";

/* ------------------------------------------------------------------
   🧮 Helpers
------------------------------------------------------------------ */
const toNumber = (val) => {
  if (typeof val === "number") return val;
  if (typeof val === "string" && val.trim() !== "") return parseFloat(val);
  return 0;
};

const centsToEuros = (cents) => toNumber(cents) / 100;

const formatMoney = (val) => `${toNumber(val).toFixed(2)} €`;

const formatDate = (iso) => dayjs(iso).format("DD/MM/YYYY");

/* ------------------------------------------------------------------
   📌 Filtres date
------------------------------------------------------------------ */
const filterByPeriod = (rows, filter) => {
  if (filter === "total") return rows;

  const now = dayjs();

  return rows.filter((p) => {
    const d = dayjs(p.created_at);

    if (filter === "week") return now.diff(d, "day") <= 7;
    if (filter === "month") return d.year() === now.year() && d.month() === now.month();
    if (filter === "year") return d.year() === now.year();

    return true;
  });
};

/* ------------------------------------------------------------------
   🎨 Filter Bar
------------------------------------------------------------------ */
function PaymentsFilterBar({ filter, onFilterChange, totalNet }) {
  return (
    <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border">
      <div className="flex gap-2 flex-wrap">
        {["week", "month", "year", "total"].map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
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
        <p className="text-2xl font-bold">{formatMoney(totalNet)}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   🎨 Liste des paiements
------------------------------------------------------------------ */
function PaymentsList({ payments, onView, onDownloadInvoice }) {
  if (!payments.length) {
    return <p className="text-gray-500 italic text-center">No payments found.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {payments.map((p) => {
        const net = p.amount_net != null ? toNumber(p.amount_net) : centsToEuros(p.amount || 0);

        const servicePrice = p.pro_service_price ?? null;
        const travelFee = p.travel_fee ?? null;

        return (
          <li key={p.id} className="py-4 flex justify-between items-center">
            <div>
              <p className="font-semibold text-gray-800">
                {formatMoney(net)} <span className="text-xs text-gray-400">(net)</span>
              </p>

              <p className="text-sm text-gray-500">{dayjs(p.created_at).format("DD MMM YYYY")}</p>

              {(servicePrice != null || travelFee != null) && (
                <p className="text-xs text-gray-500 mt-1">
                  {servicePrice != null && <span>Service: {formatMoney(servicePrice)} </span>}
                  {travelFee != null && <span>· Travel: {formatMoney(travelFee)}</span>}
                </p>
              )}

              {p.mission_id && (
                <p className="text-xs text-gray-400 mt-0.5">Mission: {p.mission_id.slice(0, 8)}…</p>
              )}
            </div>

            {/* ACTIONS */}
            <div className="flex items-center gap-3">
              {p.status === "paid" ? (
                <CheckCircle className="text-green-500" size={18} />
              ) : p.status === "refunded" ? (
                <XCircle className="text-red-500" size={18} />
              ) : (
                <Clock className="text-amber-500" size={18} />
              )}

              {/* 👁️ VIEW BUTTON */}
              <button
                onClick={() => onView(p)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
              >
                <Eye size={18} />
              </button>

              {/* PDF BUTTON */}
              <button
                onClick={() => onDownloadInvoice(p)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
              >
                <FileText size={18} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------
   🧾 Page principale
------------------------------------------------------------------ */
export default function ProDashboardPayments() {
  const { session } = useUser();
  const proId = session?.user?.id;

  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState("month");
  const [view, setView] = useState("payments");

  // For modal view
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedMission, setSelectedMission] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);

  /* ------------------------------------------------------------------
     📡 Charger paiements
  ------------------------------------------------------------------ */
  const fetchPayments = async () => {
    if (!proId) return;

    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("pro_id", proId)
      .order("created_at", { ascending: false });

    if (error) return console.error("❌ Payments fetch error:", error);

    const unique = Array.from(new Map(data.map((p) => [p.stripe_payment_id || p.id, p])).values());

    setPayments(unique);
  };

  useEffect(() => {
    if (!proId) return;

    fetchPayments();

    const channel = supabase
      .channel(`payments_pro_${proId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payments",
          filter: `pro_id=eq.${proId}`,
        },
        fetchPayments
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [proId]);

  /* ------------------------------------------------------------------
     🧮 Filtres + total net
  ------------------------------------------------------------------ */
  const filteredPayments = useMemo(() => filterByPeriod(payments, filter), [payments, filter]);

  const totalNet = useMemo(
    () =>
      filteredPayments.reduce(
        (acc, p) =>
          acc + (p.amount_net != null ? toNumber(p.amount_net) : centsToEuros(p.amount || 0)),
        0
      ),
    [filteredPayments]
  );

  /* ------------------------------------------------------------------
     👁️ View details handler
  ------------------------------------------------------------------ */
  const handleViewDetails = async (payment) => {
    setSelectedPayment(payment);

    let mission = null;
    if (payment.mission_id) {
      const { data } = await supabase
        .from("missions")
        .select("service, date, time, address, client_id")
        .eq("id", payment.mission_id)
        .maybeSingle();
      mission = data;
    }

    setSelectedMission(mission);

    if (mission?.client_id) {
      const { data } = await supabase
        .from("users")
        .select("first_name, last_name, email")
        .eq("id", mission.client_id)
        .maybeSingle();
      setSelectedClient(data);
    }
  };

  // ------------------------------------------------------------------
  // 🧾 PDF rapport global (PRO – sans frais Glossed)
  // ------------------------------------------------------------------
  const handleDownloadReport = () => {
    if (!filteredPayments.length) return;

    const doc = new jsPDF();

    const proEmail = session?.user?.email || "";
    const proName =
      session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || "";

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(225, 29, 72);
    doc.text("Glossed", 14, 20);

    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text("Payments Report", 14, 30);

    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Period: ${filter.toUpperCase()} — Generated ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      14,
      40
    );

    if (proName || proEmail) {
      doc.text(`Pro: ${proName || "—"}`, 14, 48);
      if (proEmail) doc.text(`Email: ${proEmail}`, 14, 54);
    }

    // Table
    const tableData = filteredPayments.map((p) => {
      const net = p.amount_net != null ? toNumber(p.amount_net) : centsToEuros(p.amount || 0);
      const servicePrice = p.pro_service_price ?? null;
      const travelFee = p.travel_fee ?? null;
      const totalPro = p.pro_total_price ?? net;

      return [
        p.mission_id ? p.mission_id.slice(0, 8) : "—",
        formatDate(p.created_at),
        servicePrice != null ? formatMoney(servicePrice) : "—",
        travelFee != null ? formatMoney(travelFee) : "—",
        formatMoney(totalPro),
        formatMoney(net),
        p.status,
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [["Mission", "Date", "Service", "Travel", "Total (pro)", "Net received", "Status"]],
      body: tableData,
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 240, 245] },
    });

    const finalY = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Total net received: ${formatMoney(totalNet)}`, 14, finalY);

    doc.save(`Glossed_Payments_${filter}.pdf`);
  };

  // ------------------------------------------------------------------
  // 🧾 Facture / reçu individuel (PRO – sans frais Glossed)
  // ------------------------------------------------------------------
  const handleDownloadInvoice = async (p) => {
    const doc = new jsPDF();

    const proEmail = session?.user?.email || "";
    const proName =
      session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || "";

    // On va chercher la mission et le client associé, si possible
    let mission = null;
    try {
      if (p.mission_id) {
        const { data } = await supabase
          .from("missions")
          .select("service, date, time, address, client_id")
          .eq("id", p.mission_id)
          .maybeSingle();
        mission = data || null;
      }
    } catch (err) {
      console.error("❌ Error fetching mission for invoice:", err);
    }

    let client = null;
    try {
      if (mission?.client_id) {
        const { data } = await supabase
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", mission.client_id)
          .maybeSingle();
        client = data || null;
      }
    } catch (err) {
      console.error("❌ Error fetching client for invoice:", err);
    }

    const net = p.amount_net != null ? toNumber(p.amount_net) : centsToEuros(p.amount || 0);

    const servicePrice = p.pro_service_price ?? null;
    const travelFee = p.travel_fee ?? null;
    const totalPro = p.pro_total_price ?? net;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(24);
    doc.text("Glossed Invoice", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);

    doc.text(`Invoice ID: ${p.id}`, 14, 36);
    doc.text(`Date: ${formatDate(p.created_at)}`, 14, 44);
    if (p.mission_id) doc.text(`Mission: ${p.mission_id}`, 14, 52);

    // Pro info
    doc.setFontSize(11);
    doc.text("Professional:", 14, 66);
    doc.setFontSize(10);
    doc.text(proName || "—", 14, 72);
    if (proEmail) doc.text(proEmail, 14, 78);

    // Client info
    doc.setFontSize(11);
    doc.text("Client:", 110, 66);
    doc.setFontSize(10);
    if (client) {
      const clientName = `${client.first_name || ""} ${client.last_name || ""}`.trim();
      doc.text(clientName || "—", 110, 72);
      if (client.email) doc.text(client.email, 110, 78);
    } else {
      doc.text("—", 110, 72);
    }

    // Mission details
    let y = 92;
    doc.setFontSize(11);
    doc.text("Service details", 14, y);
    y += 6;

    doc.setFontSize(10);
    if (mission?.service) {
      doc.text(`Service: ${mission.service}`, 14, y);
      y += 6;
    }
    if (mission?.date) {
      const dateStr = formatDate(mission.date);
      doc.text(`Date & time: ${dateStr}${mission.time ? ` ${mission.time}` : ""}`, 14, y);
      y += 6;
    }
    if (mission?.address) {
      doc.text(`Address: ${mission.address}`, 14, y);
      y += 6;
    }

    // Amounts
    y += 4;
    doc.setFontSize(11);
    doc.text("Amounts (Pro)", 14, y);
    y += 6;

    doc.setFontSize(10);
    if (servicePrice != null) {
      doc.text(`Service: ${formatMoney(servicePrice)}`, 14, y);
      y += 6;
    }
    if (travelFee != null) {
      doc.text(`Travel: ${formatMoney(travelFee)}`, 14, y);
      y += 6;
    }

    doc.setFont("helvetica", "bold");
    doc.text(`Total (pro): ${formatMoney(totalPro)}`, 14, y);
    y += 6;
    doc.text(`Net received: ${formatMoney(net)}`, 14, y);

    // ⚠️ Pas de frais Glossed dans ce document PRO

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
          <PaymentsFilterBar filter={filter} onFilterChange={setFilter} totalNet={totalNet} />

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Payments</h2>

            <PaymentsList
              payments={filteredPayments}
              onView={handleViewDetails}
              onDownloadInvoice={handleDownloadInvoice}
            />
          </div>

          <div className="text-center">
            <button
              onClick={() => {}}
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
        </div>
      )}

      {/* ---------------------------- MODAL ---------------------------- */}
      {selectedPayment && (
        <PaymentDetailsModal
          payment={selectedPayment}
          mission={selectedMission}
          client={selectedClient}
          onClose={() => {
            setSelectedPayment(null);
            setSelectedMission(null);
            setSelectedClient(null);
          }}
        />
      )}
    </section>
  );
}
