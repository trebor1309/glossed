import { Construction } from "lucide-react";

export default function AdminPlaceholderPage({ title, description }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <Construction className="mb-4 text-slate-400" />
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
      <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        L’espace est réservé dans la navigation. Son workflow fonctionnel sera livré dans une tranche dédiée.
      </p>
    </section>
  );
}
