import { Link } from "react-router-dom";
import { legalOperator, missingLegalOperatorFields } from "@/legal/legalConfig";

function OperatorCard({ showConfigurationWarning = false }) {
  const rows = [
    ["Operator", [legalOperator.legalName, legalOperator.legalForm].filter(Boolean).join(" ")],
    ["Registered office", legalOperator.registeredOffice],
    ["BCE/KBO", legalOperator.enterpriseNumber],
    ["VAT", legalOperator.vatNumber],
    ["Email", legalOperator.contactEmail],
    ["Telephone", legalOperator.contactPhone],
  ];

  return (
    <aside className="rounded-2xl border border-rose-100 bg-rose-50/70 p-5 text-sm text-gray-700">
      <h2 className="text-lg font-semibold text-gray-900">Glossed operator</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-medium text-gray-600">{label}</dt>
            <dd>{value || "To be completed before commercial launch"}</dd>
          </div>
        ))}
      </dl>
      {showConfigurationWarning && missingLegalOperatorFields.length > 0 && (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Commercial launch blocker: configure {missingLegalOperatorFields.join(", ")}.
        </p>
      )}
    </aside>
  );
}

export default function LegalDocumentPage({ document, showOperator = false }) {
  return (
    <article className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <header className="border-b border-gray-200 pb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-600">
          Glossed legal
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
          {document.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600">{document.summary}</p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
          <span>Version {document.version}</span>
          <span>Effective 12 October 2026</span>
        </div>
      </header>

      {showOperator && (
        <div className="mt-8">
          <OperatorCard showConfigurationWarning />
        </div>
      )}

      <div className="mt-10 space-y-10">
        {document.sections.map((section) => (
          <section key={section.title} className="scroll-mt-24">
            <h2 className="text-2xl font-semibold text-gray-950">{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="mt-4 leading-7 text-gray-700">
                {paragraph}
              </p>
            ))}
            {section.bullets && (
              <ul className="mt-4 list-disc space-y-3 pl-6 leading-7 text-gray-700">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {document.code === "privacy_notice" && (
        <div className="mt-10">
          <OperatorCard />
        </div>
      )}

      <footer className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-600">
        <p>
          Questions or complaints:{" "}
          <a
            className="font-medium text-rose-700 underline"
            href={`mailto:${legalOperator.contactEmail}`}
          >
            {legalOperator.contactEmail}
          </a>
          .
        </p>
        <p className="mt-3">
          See also{" "}
          <Link className="font-medium text-rose-700 underline" to="/legal">
            Legal Notice
          </Link>
          ,{" "}
          <Link className="font-medium text-rose-700 underline" to="/privacy">
            Privacy Notice
          </Link>
          ,{" "}
          <Link className="font-medium text-rose-700 underline" to="/terms">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link className="font-medium text-rose-700 underline" to="/terms/professionals">
            Professional Terms
          </Link>
          .
        </p>
      </footer>
    </article>
  );
}
