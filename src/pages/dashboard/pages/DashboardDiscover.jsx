import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
  UserRoundSearch,
} from "lucide-react";
import AddressAutocomplete from "@/components/forms/AddressAutocomplete";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { DISCOVERY_PAGE_SIZE, loadServiceCategories, serviceLabel } from "@/lib/providerDiscovery";

const radiusOptions = [5, 10, 20, 50, 100];

function ProviderCard({ provider, categories, serviceCode, onOpen }) {
  const displayName = provider.business_name || provider.username || "Glossed professional";
  const location = [provider.city, provider.country].filter(Boolean).join(", ");

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex min-w-0 items-start gap-4">
        <img
          src={provider.profile_photo || "/default-avatar.png"}
          alt=""
          className="h-16 w-16 shrink-0 rounded-full border border-gray-100 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-gray-900">{displayName}</h2>
            {provider.verification_status === "verified" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                <BadgeCheck size={14} aria-hidden="true" /> Verified
              </span>
            )}
          </div>
          {(location || provider.distance_km != null) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
              <MapPin size={15} aria-hidden="true" />
              {location && <span>{location}</span>}
              {provider.distance_km != null && (
                <span>about {Number(provider.distance_km).toFixed(1)} km away</span>
              )}
            </p>
          )}
        </div>
      </div>

      {provider.description && (
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-gray-600">{provider.description}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(provider.service_codes || []).map((code) => (
          <span
            key={code}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              code === serviceCode ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-700"
            }`}
          >
            {serviceLabel(categories, code)}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-5">
        <p className="mb-3 text-xs font-medium text-emerald-700">Accepting new requests</p>
        <button
          type="button"
          onClick={() => onOpen(provider.provider_id)}
          className="w-full rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2"
        >
          View profile
        </button>
      </div>
    </article>
  );
}

export default function DashboardDiscover() {
  const navigate = useNavigate();
  const { user } = useUser();
  const requestSequence = useRef(0);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [serviceCode, setServiceCode] = useState("");
  const [locationLabel, setLocationLabel] = useState(user?.address || "");
  const [coordinates, setCoordinates] = useState(() =>
    user?.latitude != null && user?.longitude != null
      ? { latitude: user.latitude, longitude: user.longitude }
      : null
  );
  const [radiusKm, setRadiusKm] = useState(20);
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadServiceCategories()
      .then((rows) => {
        if (active) setCategories(rows);
      })
      .catch(() => {
        if (active) setError("Unable to load the service categories. Please retry.");
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / DISCOVERY_PAGE_SIZE)),
    [totalCount]
  );

  const runSearch = useCallback(
    async (nextPage) => {
      if (!serviceCode) {
        setError("Choose a service.");
        return;
      }
      if (!coordinates) {
        setError("Choose a location from the address suggestions.");
        return;
      }

      const sequence = ++requestSequence.current;
      setLoading(true);
      setError("");
      try {
        const { data, error: searchError } = await supabase.rpc("search_provider_profiles", {
          p_service_code: serviceCode,
          p_search_latitude: coordinates.latitude,
          p_search_longitude: coordinates.longitude,
          p_search_radius_km: radiusKm,
          p_page: nextPage,
          p_page_size: DISCOVERY_PAGE_SIZE,
        });
        if (searchError) throw searchError;
        if (sequence !== requestSequence.current) return;

        const rows = data || [];
        setResults(rows);
        setTotalCount(Number(rows[0]?.total_count || 0));
        setPage(nextPage);
        setHasSearched(true);
      } catch (searchError) {
        if (sequence !== requestSequence.current) return;
        setResults([]);
        setTotalCount(0);
        setHasSearched(true);
        setError(searchError?.message || "Unable to search right now. Please retry.");
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [coordinates, radiusKm, serviceCode]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    runSearch(1);
  };

  const openProfile = (providerId) => {
    navigate(`/profile/${providerId}?service=${encodeURIComponent(serviceCode)}`);
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 py-2 md:py-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">
          Find a professional
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 md:text-3xl">
          Who can help with your beauty request?
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 md:text-base">
          Choose a service and location. Professionals reply with a personalized proposal—there are
          no fixed catalogue prices or durations.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1.4fr_0.7fr_auto] md:items-end md:p-6"
      >
        <label className="block text-sm font-medium text-gray-700">
          What service do you need?
          <select
            value={serviceCode}
            onChange={(event) => setServiceCode(event.target.value)}
            disabled={categoriesLoading}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            <option value="">{categoriesLoading ? "Loading services…" : "Choose a service"}</option>
            {categories.map((category) => (
              <option key={category.code} value={category.code}>
                {category.fallback_label}
              </option>
            ))}
          </select>
        </label>

        <AddressAutocomplete
          inputId="discovery-location"
          label="Where?"
          placeholder="City or address"
          defaultValue={locationLabel}
          required
          onInputChange={(value) => {
            setLocationLabel(value);
            setCoordinates(null);
          }}
          onSelect={(place) => {
            setLocationLabel(place.address);
            setCoordinates({ latitude: place.latitude, longitude: place.longitude });
          }}
        />

        <label className="block text-sm font-medium text-gray-700">
          How far?
          <select
            value={radiusKm}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            {radiusOptions.map((radius) => (
              <option key={radius} value={radius}>
                {radius} km
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={loading || categoriesLoading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          Search
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={18} /> {error}
        </div>
      )}

      {loading && (
        <div
          role="status"
          className="flex min-h-52 items-center justify-center gap-3 text-gray-600"
        >
          <Loader2 className="animate-spin" /> Searching for professionals…
        </div>
      )}

      {!loading && hasSearched && !error && results.length === 0 && (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <UserRoundSearch className="text-gray-400" size={34} />
          <h2 className="mt-3 font-semibold text-gray-900">No professionals found</h2>
          <p className="mt-1 max-w-md text-sm text-gray-600">
            Try a wider radius or another service. Your exact search location is never shown to
            professionals.
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              {totalCount} {totalCount === 1 ? "professional" : "professionals"} found
            </p>
            <p className="text-xs text-gray-500">Distances are approximate.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((provider) => (
              <ProviderCard
                key={provider.provider_id}
                provider={provider}
                categories={categories}
                serviceCode={serviceCode}
                onOpen={openProfile}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              className="flex items-center justify-center gap-4"
              aria-label="Search result pages"
            >
              <button
                type="button"
                onClick={() => runSearch(page - 1)}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => runSearch(page + 1)}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
              >
                Next <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
