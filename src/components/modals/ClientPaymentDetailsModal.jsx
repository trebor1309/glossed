import { motion } from "framer-motion";
import { X } from "lucide-react";
import dayjs from "dayjs";

const formatMoney = (val) =>
  `${(typeof val === "number" ? val : parseFloat(val || 0)).toFixed(2)} €`;

export default function ClientPaymentDetailsModal({
  payment,
  mission,
  pro,
  onClose,
  onDownloadPDF,
}) {
  if (!payment) return null;

  const gross =
    payment.amount_gross != null
      ? typeof payment.amount_gross === "number"
        ? payment.amount_gross
        : parseFloat(payment.amount_gross)
      : (payment.amount || 0) / 100;

  const proServicePrice = payment.pro_service_price != null ? payment.pro_service_price : null;
  const travelFee = payment.travel_fee != null ? payment.travel_fee : null;
  const glossedFee = payment.application_fee != null ? payment.application_fee : null;

  const totalPro =
    payment.pro_total_price != null ? payment.pro_total_price : gross - (glossedFee || 0);

  return (
    <motion.div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-3xl shadow-xl p-6 w-11/12 max-w-lg relative overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={22} />
        </button>

        <h2 className="text-xl font-bold mb-4 text-gray-800">Payment details</h2>

        <div className="space-y-3 text-gray-700 text-sm">
          <p>
            <strong>Amount paid:</strong> {formatMoney(gross)}
          </p>

          <p>
            <strong>Status:</strong>{" "}
            <span
              className={
                payment.status === "paid"
                  ? "text-green-600"
                  : payment.status === "refunded"
                    ? "text-red-600"
                    : "text-amber-600"
              }
            >
              {payment.status}
            </span>
          </p>

          <p>
            <strong>Date:</strong> {dayjs(payment.created_at).format("DD/MM/YYYY")}
          </p>

          {mission && (
            <>
              <hr className="my-2" />
              <p className="font-semibold text-gray-900">Booking / service</p>
              <p>
                <strong>Service:</strong> {mission.service}
              </p>
              {mission.date && (
                <p>
                  <strong>Appointment:</strong> {dayjs(mission.date).format("DD/MM/YYYY")}{" "}
                  {mission.time && `at ${mission.time}`}
                </p>
              )}
              {mission.address && (
                <p>
                  <strong>Address:</strong> {mission.address}
                </p>
              )}
            </>
          )}

          {pro && (
            <>
              <hr className="my-2" />
              <p className="font-semibold text-gray-900">Professional</p>
              <p>
                <strong>Name:</strong>{" "}
                {pro.first_name || pro.last_name
                  ? `${pro.first_name || ""} ${pro.last_name || ""}`.trim()
                  : pro.full_name || "—"}
              </p>
              {pro.email && (
                <p>
                  <strong>Email:</strong> {pro.email}
                </p>
              )}
            </>
          )}

          <hr className="my-2" />
          <p className="font-semibold text-gray-900">Amounts details</p>

          {proServicePrice != null && (
            <p>
              <strong>Service:</strong> {formatMoney(proServicePrice)}
            </p>
          )}

          {travelFee != null && (
            <p>
              <strong>Travel:</strong> {formatMoney(travelFee)}
            </p>
          )}

          <p>
            <strong>Amount for professional:</strong> {formatMoney(totalPro)}
          </p>

          {glossedFee != null && (
            <p>
              <strong>Glossed fee:</strong> {formatMoney(glossedFee)}
            </p>
          )}

          <p>
            <strong>Total paid:</strong> {formatMoney(gross)}
          </p>

          <p className="text-xs text-gray-400 mt-2">
            Glossed acts as a marketplace. The service is provided by the professional, Glossed only
            processes the payment and takes a service fee.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
          >
            Close
          </button>
          <button
            onClick={() => onDownloadPDF(payment)}
            className="px-5 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold hover:scale-[1.02] transition"
          >
            Download PDF
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
