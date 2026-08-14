import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { globalAdminSearch } from "./adminOperationsApi";

export default function AdminGlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setError(null);
      return undefined;
    }
    const currentRequest = ++requestId.current;
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await globalAdminSearch(normalized);
        if (requestId.current === currentRequest) setResults(data?.results || []);
      } catch (searchError) {
        if (requestId.current === currentRequest) setError(searchError.message);
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const select = (result) => {
    setOpen(false);
    setQuery("");
    navigate(result.route);
  };

  return (
    <div className="relative w-full max-w-2xl">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Rechercher un utilisateur, email, mission ou identifiant…"
        aria-label="Recherche globale administration"
        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
      />
      {query && <button type="button" aria-label="Effacer la recherche" onClick={() => setQuery("")} className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"><X size={18} /></button>}
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {loading && <p className="px-3 py-4 text-sm text-slate-500">Recherche…</p>}
          {error && <p className="px-3 py-4 text-sm text-red-700">{error}</p>}
          {!loading && !error && results.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">Aucun résultat.</p>}
          {!loading && results.map((result) => (
            <button key={`${result.result_type}-${result.result_id}`} type="button" onClick={() => select(result)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100">
              <span className="block text-sm font-semibold text-slate-900">{result.title}</span>
              <span className="block truncate text-xs text-slate-500">{result.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
