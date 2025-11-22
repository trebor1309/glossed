import { motion } from "framer-motion";
import { X } from "lucide-react";
import dayjs from "dayjs";

export default function PaymentDetailsModal({ payment, mission, client, onClose, onDownloadPDF }) {
  if (!payment) return null;

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

        <h2 className="text-xl font-bold mb-4 text-gray-800">Payment Details</h2>

        {/* SUMMARY */}
        <div className="space-y-3 text-gray-700">
          <p>
            <strong>Amount received:</strong>{" "}
            {payment.amount_net != null
              ? `${payment.amount_net.toFixed(2)} €`
              : `${(payment.amount / 100).toFixed(2)} €`}
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

              <p className="text-gray-900 font-semibold">Mission</p>
              <p>
                <strong>Service:</strong> {mission.service}
              </p>

              {mission.date && (
                <p>
                  <strong>Date:</strong> {dayjs(mission.date).format("DD/MM/YYYY")}{" "}
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

          {client && (
            <>
              <hr className="my-2" />
              <p className="text-gray-900 font-semibold">Client</p>

              <p>
                <strong>Name:</strong> {client.first_name} {client.last_name}
              </p>

              {client.email && (
                <p>
                  <strong>Email:</strong> {client.email}
                </p>
              )}
            </>
          )}

          <hr className="my-2" />
          <p className="text-gray-900 font-semibold">Amounts</p>

          {payment.pro_service_price != null && (
            <p>
              <strong>Service:</strong> {payment.pro_service_price.toFixed(2)} €
            </p>
          )}

          {payment.travel_fee != null && (
            <p>
              <strong>Travel:</strong> {payment.travel_fee.toFixed(2)} €
            </p>
          )}

          <p>
            <strong>Total (pro):</strong>{" "}
            {payment.pro_total_price != null
              ? `${payment.pro_total_price.toFixed(2)} €`
              : `${(payment.amount_net ?? payment.amount / 100).toFixed(2)} €`}
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
