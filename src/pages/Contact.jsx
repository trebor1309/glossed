import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  HeartHandshake,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
} from "lucide-react";
import { legalOperator } from "@/legal/legalConfig";
import { submitContactRequest } from "@/lib/contactSupport";
import { logUnexpectedError, userFacingError } from "@/lib/userFacingError";

const categories = [
  ["general", "General question"],
  ["booking", "Booking or payment"],
  ["account", "Account help"],
  ["professional", "Professional onboarding"],
  ["safety", "Safety or report"],
  ["privacy", "Privacy request"],
  ["partnership", "Partnership"],
  ["press", "Press inquiry"],
];
const validTopics = new Set(categories.map(([value]) => value));

const emptyForm = (category = "general") => ({
  category,
  name: "",
  email: "",
  subject: "",
  message: "",
  website: "",
});

export default function Contact() {
  const [searchParams] = useSearchParams();
  const requestedTopic = searchParams.get("topic")?.toLowerCase() ?? "";
  const initialCategory = validTopics.has(requestedTopic) ? requestedTopic : "general";
  const [form, setForm] = useState(() => emptyForm(initialCategory));
  const [requestId, setRequestId] = useState(null);
  const [status, setStatus] = useState({ state: "idle", message: "", reference: null });

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setRequestId(null);
    if (status.state !== "idle") setStatus({ state: "idle", message: "", reference: null });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const currentRequestId = requestId ?? crypto.randomUUID();
    setRequestId(currentRequestId);
    setStatus({ state: "sending", message: "", reference: null });

    try {
      const result = await submitContactRequest({
        ...form,
        requestId: currentRequestId,
        locale: navigator.language || "en",
        sourcePath: `${window.location.pathname}${window.location.search}`,
      });
      setForm(emptyForm(initialCategory));
      setRequestId(null);
      setStatus({
        state: "success",
        message: "Your message has reached Glossed support. We’ll reply by email.",
        reference: result.reference,
      });
    } catch (error) {
      logUnexpectedError("Public contact request failed", error);
      setStatus({
        state: "error",
        message: userFacingError(error, "Unable to send your message right now."),
        reference: null,
      });
    }
  };

  const phoneHref = `tel:${legalOperator.contactPhone.replace(/[^+\d]/g, "")}`;
  const operatorDescription = legalOperator.operatorTradeName
    ? `${legalOperator.legalName}, trading as ${legalOperator.operatorTradeName}`
    : legalOperator.legalName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="mx-auto max-w-6xl px-6 py-20"
    >
      <div className="mb-16 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <MessageSquare size={32} />
        </div>
        <h1 className="mb-4 text-4xl font-bold">Contact Glossed</h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-600">
          Tell us what you need and your message will be routed to the right place. Please include a
          booking reference when your request concerns an existing reservation.
        </p>
      </div>

      <section className="mb-20 grid gap-8 text-center md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow transition hover:shadow-lg">
          <Mail size={28} className="mx-auto mb-4 text-rose-600" />
          <h2 className="mb-2 font-semibold text-gray-800">Email</h2>
          <p className="mb-3 text-sm text-gray-600">One verified address for every request.</p>
          <a
            href={`mailto:${legalOperator.contactEmail}`}
            className="font-medium text-rose-600 hover:text-rose-700"
          >
            {legalOperator.contactEmail}
          </a>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow transition hover:shadow-lg">
          <HeartHandshake size={28} className="mx-auto mb-4 text-rose-600" />
          <h2 className="mb-2 font-semibold text-gray-800">Professionals</h2>
          <p className="mb-3 text-sm text-gray-600">
            Choose “Professional onboarding” in the form for faster routing.
          </p>
          <a
            href="#contact-form"
            className="font-medium text-rose-600 hover:text-rose-700"
            onClick={() => {
              setForm((current) => ({ ...current, category: "professional" }));
              setRequestId(null);
            }}
          >
            Contact the pro team
          </a>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow transition hover:shadow-lg">
          <Phone size={28} className="mx-auto mb-4 text-rose-600" />
          <h2 className="mb-2 font-semibold text-gray-800">Telephone</h2>
          <p className="mb-3 text-sm text-gray-600">For urgent operational or safety matters.</p>
          <a href={phoneHref} className="font-medium text-rose-600 hover:text-rose-700">
            {legalOperator.contactPhone}
          </a>
        </div>
      </section>

      <section
        id="contact-form"
        className="mx-auto max-w-3xl scroll-mt-24 rounded-3xl border border-gray-100 bg-white p-6 shadow sm:p-10"
      >
        <h2 className="mb-2 text-center text-2xl font-semibold text-gray-800">Send a message</h2>
        <p className="mb-8 text-center text-sm text-gray-500">
          Required fields are marked with an asterisk. Messages are retained as described in our{" "}
          <Link className="font-medium text-rose-700 underline" to="/privacy">
            Privacy Notice
          </Link>
          .
        </p>

        {status.state === "success" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={32} />
            <p className="font-semibold text-emerald-900">Message received</p>
            <p className="mt-2 text-sm text-emerald-800" role="status">
              {status.message}
            </p>
            {status.reference && (
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
                Reference {status.reference}
              </p>
            )}
            <button
              type="button"
              className="mt-5 font-medium text-rose-700 underline"
              onClick={() => setStatus({ state: "idle", message: "", reference: null })}
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div
              className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
              aria-hidden="true"
            >
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                value={form.website}
                onChange={updateField}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div>
              <label
                htmlFor="contact-category"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Topic *
              </label>
              <select
                id="contact-category"
                name="category"
                required
                value={form.category}
                onChange={updateField}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="contact-name"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Your name *
                </label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={form.name}
                  onChange={updateField}
                  placeholder="Jane Doe"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-email"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Email *
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={form.email}
                  onChange={updateField}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="contact-subject"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Subject
              </label>
              <input
                id="contact-subject"
                name="subject"
                type="text"
                minLength={2}
                maxLength={160}
                value={form.subject}
                onChange={updateField}
                placeholder="Booking issue, account help…"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-4">
                <label
                  htmlFor="contact-message"
                  className="block text-sm font-medium text-gray-700"
                >
                  Message *
                </label>
                <span className="text-xs text-gray-400">{form.message.length}/5000</span>
              </div>
              <textarea
                id="contact-message"
                name="message"
                rows={6}
                required
                minLength={20}
                maxLength={5000}
                value={form.message}
                onChange={updateField}
                placeholder="Describe what happened and include any useful booking reference…"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            {status.state === "error" && (
              <div
                className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                role="alert"
              >
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <p>{status.message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={status.state === "sending"}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-6 py-3 font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status.state === "sending" ? (
                <>
                  <LoaderCircle className="animate-spin" size={18} /> Sending…
                </>
              ) : (
                "Send message"
              )}
            </button>
          </form>
        )}
      </section>

      <div className="mt-20 text-center">
        <MapPin size={22} className="mx-auto mb-3 text-rose-500" />
        <p className="text-sm text-gray-500">
          Operated by {operatorDescription} — Malmedy, Belgium.
        </p>
      </div>
    </motion.div>
  );
}
