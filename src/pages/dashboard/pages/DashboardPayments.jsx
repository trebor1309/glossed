import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";

import { Download, FileText, Eye, CheckCircle, XCircle, Clock } from "lucide-react";

import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import ClientPaymentDetailsModal from "@/components/modals/ClientPaymentDetailsModal";

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
   📌 Date filters
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

function PaymentsFilterBar({ filter, onFilterChange, totalGross }) {
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
        <p className="text-gray-500 text-sm">Total paid</p>
        <p className="text-2xl font-bold">{formatMoney(totalGross)}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   🎨 List (client view)
------------------------------------------------------------------ */

function ClientPaymentsList({ payments, onView, onDownloadInvoice }) {
  if (!payments.length) {
    return <p className="text-gray-500 italic text-center">No payments found.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {payments.map((p) => {
        const gross =
          p.amount_gross != null ? toNumber(p.amount_gross) : centsToEuros(p.amount || 0);

        const glossedFee = p.application_fee != null ? toNumber(p.application_fee) : null;

        return (
          <li key={p.id} className="py-4 flex justify-between items-center">
            <div>
              <p className="font-semibold text-gray-800">{formatMoney(gross)}</p>
              <p className="text-sm text-gray-500">{dayjs(p.created_at).format("DD MMM YYYY")}</p>
              {p.mission_id && (
                <p className="text-xs text-gray-400 mt-0.5">Mission: {p.mission_id.slice(0, 8)}…</p>
              )}
              {glossedFee != null && (
                <p className="text-xs text-gray-500">
                  Includes Glossed fee: {formatMoney(glossedFee)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {p.status === "paid" ? (
                <CheckCircle className="text-green-500" size={18} />
              ) : p.status === "refunded" ? (
                <XCircle className="text-red-500" size={18} />
              ) : (
                <Clock className="text-amber-500" size={18} />
              )}

              <button
                onClick={() => onView(p)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
              >
                <Eye size={18} />
              </button>

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
   🧾 Main page
------------------------------------------------------------------ */

export default function DashboardPayments() {
  const { session } = useUser();
  const clientId = session?.user?.id;

  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState("month");

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedMission, setSelectedMission] = useState(null);
  const [selectedPro, setSelectedPro] = useState(null);

  /* ------------------------------------------------------------------
     📡 Fetch payments for client
  ------------------------------------------------------------------ */
  const fetchPayments = async () => {
    if (!clientId) return;

    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Payments fetch error (client):", error);
      return;
    }

    const rows = data || [];

    const unique = Array.from(new Map(rows.map((p) => [p.stripe_payment_id || p.id, p])).values());

    setPayments(unique);
  };

  useEffect(() => {
    if (!clientId) return;

    fetchPayments();

    const channel = supabase
      .channel(`payments_client_${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payments",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          console.log("💸 New client payment, refreshing list…");
          fetchPayments();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [clientId]);

  /* ------------------------------------------------------------------
     🧮 Filters + totals (gross)
  ------------------------------------------------------------------ */
  const filteredPayments = useMemo(() => filterByPeriod(payments, filter), [payments, filter]);

  const totalGross = useMemo(
    () =>
      filteredPayments.reduce((acc, p) => {
        if (p.amount_gross != null) return acc + toNumber(p.amount_gross);
        return acc + centsToEuros(p.amount || 0);
      }, 0),
    [filteredPayments]
  );

  /* ------------------------------------------------------------------
     👁️ View details
  ------------------------------------------------------------------ */
  const handleViewDetails = async (payment) => {
    setSelectedPayment(payment);

    // Mission
    let mission = null;
    if (payment.mission_id) {
      const { data } = await supabase
        .from("missions")
        .select("service, date, time, address, pro_id")
        .eq("id", payment.mission_id)
        .maybeSingle();
      mission = data || null;
    }
    setSelectedMission(mission);

    // Pro info
    if (mission?.pro_id || payment.pro_id) {
      const proId = mission?.pro_id || payment.pro_id;
      const { data } = await supabase
        .from("users")
        .select("first_name, last_name, full_name, email")
        .eq("id", proId)
        .maybeSingle();
      setSelectedPro(data || null);
    } else {
      setSelectedPro(null);
    }
  };

  /* ------------------------------------------------------------------
     🧾 PDF report global (client)
  ------------------------------------------------------------------ */
  const handleDownloadReport = () => {
    if (!filteredPayments.length) return;

    const doc = new jsPDF();

    const clientEmail = session?.user?.email || "";
    const clientName =
      session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || "";

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(225, 29, 72);
    doc.text("Glossed", 14, 20);

    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text("Payments Report (Client)", 14, 30);

    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Period: ${filter.toUpperCase()} — Generated ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      14,
      40
    );

    if (clientName || clientEmail) {
      doc.text(`Client: ${clientName || "—"}`, 14, 48);
      if (clientEmail) doc.text(`Email: ${clientEmail}`, 14, 54);
    }

    const tableData = filteredPayments.map((p) => {
      const gross = p.amount_gross != null ? toNumber(p.amount_gross) : centsToEuros(p.amount || 0);
      const glossedFee = p.application_fee != null ? toNumber(p.application_fee) : null;

      return [
        p.mission_id ? p.mission_id.slice(0, 8) : "—",
        formatDate(p.created_at),
        formatMoney(gross),
        glossedFee != null ? formatMoney(glossedFee) : "—",
        p.status,
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [["Mission", "Date", "Total paid", "Glossed fee", "Status"]],
      body: tableData,
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 240, 245] },
    });

    const finalY = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Total paid: ${formatMoney(totalGross)}`, 14, finalY);

    doc.save(`Glossed_Client_Payments_${filter}.pdf`);
  };

  /* ------------------------------------------------------------------
     🧾 Invoice / receipt for one payment (client)
  ------------------------------------------------------------------ */
  const handleDownloadInvoice = async (p) => {
    const doc = new jsPDF();

    const clientEmail = session?.user?.email || "";
    const clientName =
      session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || "";

    // Mission
    let mission = null;
    if (p.mission_id) {
      const { data } = await supabase
        .from("missions")
        .select("service, date, time, address, pro_id")
        .eq("id", p.mission_id)
        .maybeSingle();
      mission = data || null;
    }

    // Pro
    let pro = null;
    if (mission?.pro_id || p.pro_id) {
      const proId = mission?.pro_id || p.pro_id;
      const { data } = await supabase
        .from("users")
        .select("first_name, last_name, full_name, email")
        .eq("id", proId)
        .maybeSingle();
      pro = data || null;
    }

    const gross = p.amount_gross != null ? toNumber(p.amount_gross) : centsToEuros(p.amount || 0);

    const glossedFee = p.application_fee != null ? toNumber(p.application_fee) : null;

    const proServicePrice = p.pro_service_price != null ? toNumber(p.pro_service_price) : null;
    const travelFee = p.travel_fee != null ? toNumber(p.travel_fee) : null;

    const totalPro =
      p.pro_total_price != null ? toNumber(p.pro_total_price) : gross - (glossedFee || 0);

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

    // Client info
    doc.setFontSize(11);
    doc.text("Billed to:", 14, 66);
    doc.setFontSize(10);
    doc.text(clientName || "—", 14, 72);
    if (clientEmail) doc.text(clientEmail, 14, 78);

    // Pro info
    doc.setFontSize(11);
    doc.text("Service provider:", 110, 66);
    doc.setFontSize(10);
    if (pro) {
      const proName =
        pro.first_name || pro.last_name
          ? `${pro.first_name || ""} ${pro.last_name || ""}`.trim()
          : pro.full_name || "—";
      doc.text(proName, 110, 72);
      if (pro.email) doc.text(pro.email, 110, 78);
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
      doc.text(
        `Appointment: ${formatDate(mission.date)}${mission.time ? ` ${mission.time}` : ""}`,
        14,
        y
      );
      y += 6;
    }
    if (mission?.address) {
      doc.text(`Address: ${mission.address}`, 14, y);
      y += 6;
    }

    // Amounts
    y += 4;
    doc.setFontSize(11);
    doc.text("Amount details", 14, y);
    y += 6;

    doc.setFontSize(10);
    if (proServicePrice != null) {
      doc.text(`Service: ${formatMoney(proServicePrice)}`, 14, y);
      y += 6;
    }
    if (travelFee != null) {
      doc.text(`Travel: ${formatMoney(travelFee)}`, 14, y);
      y += 6;
    }

    doc.text(`Amount to professional: ${formatMoney(totalPro)}`, 14, y);
    y += 6;

    if (glossedFee != null) {
      doc.text(`Glossed fee: ${formatMoney(glossedFee)}`, 14, y);
      y += 6;
    }

    doc.setFont("helvetica", "bold");
    doc.text(`Total paid: ${formatMoney(gross)}`, 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(
      "Glossed acts as a marketplace. The service is provided by the professional.",
      14,
      y + 6
    );

    doc.save(`Glossed_Client_Invoice_${p.id}.pdf`);
  };

  /* ------------------------------------------------------------------
     UI
  ------------------------------------------------------------------ */
  return (
    <section className="mt-10 max-w-4xl mx-auto px-4 space-y-10">
      <h1 className="text-2xl font-bold text-center text-gray-800">My payments</h1>

      {/* FILTERS */}
      <PaymentsFilterBar filter={filter} onFilterChange={setFilter} totalGross={totalGross} />

      {/* LIST */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Payment history</h2>

        <ClientPaymentsList
          payments={filteredPayments}
          onView={handleViewDetails}
          onDownloadInvoice={handleDownloadInvoice}
        />
      </div>

      {/* PDF EXPORT */}
      <div className="text-center">
        <button
          onClick={handleDownloadReport}
          className="px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-medium shadow-md hover:scale-[1.03] transition"
        >
          <Download size={18} className="inline-block mr-2" />
          Download report
        </button>
      </div>

      {/* MODAL */}
      {selectedPayment && (
        <ClientPaymentDetailsModal
          payment={selectedPayment}
          mission={selectedMission}
          pro={selectedPro}
          onClose={() => {
            setSelectedPayment(null);
            setSelectedMission(null);
            setSelectedPro(null);
          }}
          onDownloadPDF={handleDownloadInvoice}
        />
      )}
    </section>
  );
}
