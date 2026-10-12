export default function SignupLegalFields({ professional = false }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <legend className="px-1 text-sm font-semibold text-gray-800">Legal agreements</legend>

      <label className="flex gap-3 text-sm leading-5 text-gray-700">
        <input type="checkbox" name="acceptClientTerms" required className="mt-1 accent-rose-600" />
        <span>
          I accept the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-rose-700 underline"
          >
            Terms of Use and Booking
          </a>
          .
        </span>
      </label>

      {professional && (
        <label className="flex gap-3 text-sm leading-5 text-gray-700">
          <input
            type="checkbox"
            name="acceptProviderTerms"
            required
            className="mt-1 accent-rose-600"
          />
          <span>
            I accept the{" "}
            <a
              href="/terms/professionals"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-700 underline"
            >
              Professional Terms
            </a>
            .
          </span>
        </label>
      )}

      <label className="flex gap-3 text-sm leading-5 text-gray-700">
        <input
          type="checkbox"
          name="acknowledgePrivacy"
          required
          className="mt-1 accent-rose-600"
        />
        <span>
          I acknowledge that I have received the{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-rose-700 underline"
          >
            Privacy Notice
          </a>
          . This acknowledgement is not consent to unrelated processing.
        </span>
      </label>
    </fieldset>
  );
}
