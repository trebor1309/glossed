import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { v4 as uuid } from "uuid";
import AddressAutocomplete from "@/components/forms/AddressAutocomplete";
import {
  createMyUserAddress,
  deleteMyUserAddress,
  listMyUserAddresses,
  savedAddressErrorMessage,
  setMyDefaultUserAddress,
  updateMyUserAddress,
} from "@/lib/userAddresses";

const emptyDraft = {
  label: "",
  formatted_address: "",
  city: null,
  postal_code: null,
  country_code: null,
  latitude: null,
  longitude: null,
};

export default function SavedAddressesSection({ onMessage }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [changeAddress, setChangeAddress] = useState(false);
  const operationIdRef = useRef(uuid());
  const attemptedPayloadRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAddresses(await listMyUserAddresses());
    } catch (error) {
      onMessage({ type: "error", message: savedAddressErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    load();
  }, [load]);

  const startAdd = () => {
    operationIdRef.current = uuid();
    attemptedPayloadRef.current = null;
    setDraft(emptyDraft);
    setChangeAddress(true);
    setFormMode("add");
  };

  const startEdit = (address) => {
    setDraft({ ...address });
    setChangeAddress(false);
    setFormMode("edit");
  };

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (formMode === "add" && attemptedPayloadRef.current) {
      operationIdRef.current = uuid();
      attemptedPayloadRef.current = null;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const payload = {
      ...draft,
      label: draft.label.trim(),
      formatted_address: draft.formatted_address.trim(),
    };
    if (
      !payload.label ||
      !payload.formatted_address ||
      payload.latitude == null ||
      payload.longitude == null
    ) {
      onMessage({ type: "error", message: "Choose a valid address from the suggestions." });
      return;
    }

    setBusy(true);
    try {
      if (formMode === "add") {
        attemptedPayloadRef.current = JSON.stringify(payload);
        await createMyUserAddress(operationIdRef.current, payload);
      } else {
        await updateMyUserAddress(payload.id, payload);
      }
      await load();
      setFormMode(null);
      onMessage({ type: "success", message: "Saved addresses updated." });
    } catch (error) {
      onMessage({ type: "error", message: savedAddressErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (addressId) => {
    if (busy) return;
    setBusy(true);
    try {
      await setMyDefaultUserAddress(addressId);
      await load();
      onMessage({ type: "success", message: "Default address updated." });
    } catch (error) {
      onMessage({ type: "error", message: savedAddressErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (address) => {
    if (busy || !window.confirm(`Delete “${address.label}”?`)) return;
    setBusy(true);
    try {
      await deleteMyUserAddress(address.id);
      await load();
      onMessage({ type: "success", message: "Saved address deleted." });
    } catch (error) {
      onMessage({ type: "error", message: savedAddressErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="saved-addresses"
      className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-md"
      aria-labelledby="saved-addresses-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="saved-addresses-title"
            className="flex items-center gap-2 text-lg font-semibold text-gray-800"
          >
            <MapPin className="h-5 w-5 text-rose-600" /> Saved service addresses
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Private addresses where you may want to receive a service. They are never shown on your
            public profile.
          </p>
        </div>
        <button
          type="button"
          onClick={startAdd}
          disabled={busy || addresses.length >= 20}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus size={16} /> Add address
        </button>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-gray-500">
          Loading saved addresses…
        </p>
      ) : addresses.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
          No saved address yet. You can add one here or while creating a request.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="min-w-0 rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-gray-800">
                    {address.label}
                    {address.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                        <Star size={12} aria-hidden="true" /> Default
                      </span>
                    )}
                  </p>
                  <p className="mt-1 break-words text-sm text-gray-600">
                    {address.formatted_address}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!address.is_default && (
                  <button
                    type="button"
                    onClick={() => makeDefault(address.id)}
                    disabled={busy}
                    className="text-sm font-medium text-rose-700 disabled:opacity-50"
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(address)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 disabled:opacity-50"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(address)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formMode && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-rose-100 bg-rose-50/40 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-gray-800">
              {formMode === "add" ? "Add a saved address" : "Edit saved address"}
            </h4>
            <button
              type="button"
              onClick={() => setFormMode(null)}
              disabled={busy}
              aria-label="Close address form"
              className="rounded p-1 text-gray-500 hover:bg-white"
            >
              <X size={18} />
            </button>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Label
            <input
              value={draft.label}
              onChange={(event) => updateDraft({ label: event.target.value })}
              maxLength={50}
              required
              placeholder="Home or Work"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:ring-2 focus:ring-rose-300"
            />
          </label>

          {formMode === "edit" && !changeAddress ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="break-words text-sm text-gray-700">{draft.formatted_address}</p>
              <button
                type="button"
                onClick={() => setChangeAddress(true)}
                className="mt-2 text-sm font-medium text-rose-700"
              >
                Change address
              </button>
            </div>
          ) : (
            <AddressAutocomplete
              inputId={`saved-address-${formMode}`}
              label="Address"
              placeholder="Start typing an address"
              defaultValue={draft.formatted_address}
              required
              types={["address"]}
              onInputChange={(value) =>
                updateDraft({ formatted_address: value, latitude: null, longitude: null })
              }
              onSelect={(place) =>
                updateDraft({
                  formatted_address: place.address,
                  city: place.city,
                  postal_code: place.postal_code,
                  country_code: place.country_code,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })
              }
            />
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormMode(null)}
              disabled={busy}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Check size={16} /> {busy ? "Saving…" : "Save address"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
