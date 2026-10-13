export const LEGAL_VERSION = "2026-10-12";
export const LEGAL_EFFECTIVE_DATE = "12 October 2026";

const officialSources = {
  ecommerce:
    "https://economie.fgov.be/fr/themes/entreprises/guidance/pratiques-commerciales/obligations-dinformation-dans",
  gdpr: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
  consumerRights: "https://eur-lex.europa.eu/eli/dir/2011/83/oj",
  dsa: "https://eur-lex.europa.eu/eli/reg/2022/2065/oj",
  p2b: "https://eur-lex.europa.eu/eli/reg/2019/1150/oj",
  consumerMediation:
    "https://economie.fgov.be/en/themes/online/belmed-online-mediation/alternative-dispute-resolution/forms-dispute-resolution/ombudsman/belmed-partners-ombudsmen/consumer-mediation-service",
};

export const legalDocuments = Object.freeze({
  legal_notice: {
    code: "legal_notice",
    version: LEGAL_VERSION,
    contentHash: "53c0e10197828cab990695048bd4d933a8b3ac46a61f9bf5947d2fc4125ed4d3",
    title: "Legal Notice",
    shortTitle: "Legal notice",
    route: "/legal",
    audience: "public",
    acceptanceKind: "none",
    summary: "Operator, publication, hosting and platform-role information.",
    sources: [officialSources.ecommerce, officialSources.dsa],
    sections: [
      {
        title: "1. Operator and contact",
        paragraphs: [
          "Glossed is an online marketplace for beauty services. The complete identity and contact details of the legal entity operating Glossed appear in the operator card on this page.",
          "Questions about the website or the service can be sent to the published support address. Legal notices should clearly identify their subject and the sender.",
        ],
      },
      {
        title: "2. Publication and infrastructure",
        paragraphs: [
          "The Glossed application is published by the operator identified on this page. Its web interface is hosted through Vercel infrastructure and its application data is hosted through Supabase infrastructure. These providers act under their own terms and, where applicable, as processors for Glossed.",
          "Payments and professional payout onboarding are supplied by Stripe. Address suggestions and maps are supplied by Google Maps Platform. Email delivery may be supplied by Resend. Those services are only used for the purposes described in the Privacy Notice.",
        ],
      },
      {
        title: "3. Glossed's role",
        paragraphs: [
          "Glossed provides intermediation, booking, communication and payment tooling. Beauty professionals remain independent service providers and are responsible for the services they describe, price and perform. Unless a mandatory rule provides otherwise, the beauty-service contract is concluded between the client and the professional when an offer is accepted and paid.",
          "Glossed is not a beauty-service provider, employer, temporary-work agency, bank or payment institution. Regulated payment services are performed by Stripe and its regulated affiliates. Glossed remains responsible for the platform services it provides and for duties that the law does not allow it to exclude.",
        ],
      },
      {
        title: "4. Intellectual property",
        paragraphs: [
          "The Glossed name, interface, original text, graphics and software are protected by applicable intellectual-property law. No licence is granted except the limited right to use the platform in accordance with the applicable terms.",
          "User content remains owned by its author or rightsholder. The limited platform licence governing user content is described in the Terms of Use and the Professional Terms.",
        ],
      },
      {
        title: "5. Reports and unlawful content",
        paragraphs: [
          "Suspected unlawful content, unsafe conduct, impersonation or intellectual-property infringement can be reported through the Contact page. A report should identify the content, explain the concern and provide reliable contact details. Glossed may request supporting information, restrict content while reviewing it and communicate a reasoned decision where required.",
        ],
      },
      {
        title: "6. Applicable law",
        paragraphs: [
          "This website is operated from Belgium. Belgian law applies without depriving consumers of mandatory protections applicable in their country of habitual residence. The dispute provisions in the relevant client or professional terms apply to contractual matters.",
        ],
      },
    ],
  },
  privacy_notice: {
    code: "privacy_notice",
    version: LEGAL_VERSION,
    contentHash: "98837283cea64be06082f3bde7d645c020c27b9f8f8f2208c852a77b1c461f5b",
    title: "Privacy Notice",
    shortTitle: "Privacy notice",
    route: "/privacy",
    audience: "all",
    acceptanceKind: "notice_acknowledgement",
    summary: "How Glossed collects, uses, shares and retains personal data.",
    sources: [officialSources.gdpr],
    sections: [
      {
        title: "1. Controller and scope",
        paragraphs: [
          "The Glossed operator identified in the Legal Notice is the controller for the account, marketplace, support, trust and safety, and platform-payment data described here. Stripe, Google, Supabase, Vercel and Resend may also act as independent controllers for some processing they determine themselves.",
          "This notice applies to visitors, clients and beauty professionals using the Glossed web application. Acknowledging this notice records that it was provided to you; it is not consent to processing that relies on contract, law or legitimate interests.",
        ],
      },
      {
        title: "2. Data we process",
        bullets: [
          "Account and identity data: email, username, name, telephone number, profile photo and authentication identifiers.",
          "Location data: addresses, approximate coordinates and service radius. A precise private address is not made public merely because it is stored.",
          "Professional data: business name, business address, registration and VAT details, professional status, service categories, verification documents and eligibility declarations.",
          "Marketplace data: requests, offers, bookings, messages, reviews, reports, cancellations, disputes and completion confirmations.",
          "Payment data: amounts, fee and allocation snapshots, Stripe account and transaction references, payout status, refunds and chargeback information. Glossed does not store full card numbers.",
          "Technical and audit data: session identifiers, timestamps, security events, acceptance versions, device/browser information made available in normal network requests and operational logs.",
          "Support data: messages, attachments and follow-up history you send to us.",
        ],
      },
      {
        title: "3. Purposes and legal bases",
        bullets: [
          "Contract: create and secure accounts; publish requests and offers; provide chat, booking, payment, payout and support functions; keep versioned contractual evidence.",
          "Legal obligations: accounting and tax records, fraud prevention, professional traceability, lawful requests, payment compliance and consumer-protection duties.",
          "Legitimate interests: platform security, abuse prevention, service quality, dispute handling, limited product analytics and establishment or defence of legal claims, balanced against your rights.",
          "Consent: only where an optional feature expressly asks for it, such as non-essential marketing or device permissions. You can withdraw consent without affecting earlier lawful processing.",
        ],
      },
      {
        title: "4. Sources and required data",
        paragraphs: [
          "Most data comes from you, your interactions with another user, Stripe account and payment events, Google address selections, or security and application logs. Professional verification data may be checked against official registers or reliable supporting documents.",
          "Fields marked as required are needed to create an account, enter a booking, comply with professional traceability rules or process payment. Without them, the relevant feature may not be available.",
        ],
      },
      {
        title: "5. Recipients and service providers",
        bullets: [
          "The client and selected professional receive the information necessary to propose, book and perform the service.",
          "Stripe processes checkout, refunds, disputes, connected-account verification and payouts.",
          "Supabase supplies database, authentication, storage and server functions; Vercel supplies web hosting; Resend may deliver transactional email; Google Maps Platform supplies address and map functions.",
          "Authorised Glossed administrators access data only where their role requires it, with audit controls for sensitive actions.",
          "Authorities, advisers, insurers or counterparties may receive data where required by law or necessary to establish, exercise or defend legal claims.",
        ],
      },
      {
        title: "6. International transfers",
        paragraphs: [
          "Some providers or their subprocessors may process data outside the European Economic Area. Glossed will rely on an applicable adequacy decision or appropriate safeguards, such as the European Commission's standard contractual clauses, and will assess supplementary measures where required. Details can be requested through the contact address below.",
        ],
      },
      {
        title: "7. Retention",
        bullets: [
          "Active account and profile data is kept while the account is open and then deleted or anonymised after a reasonable closure period, unless another retention duty applies.",
          "Booking, payment, invoice, fee, payout and tax records are retained for the statutory accounting and tax period applicable to the operator and professional.",
          "Trust, safety, complaint, dispute and audit records are retained for the time needed to resolve the matter and for the applicable limitation period.",
          "Legal acceptance evidence is retained for the contractual relationship and the period needed to establish or defend related claims.",
          "Support messages are normally deleted or anonymised within 24 months after the request closes unless they form part of a booking, dispute or legal record.",
        ],
      },
      {
        title: "8. Security",
        paragraphs: [
          "Glossed uses access controls, row-level database policies, encrypted transport, private document storage, audit trails and restricted server credentials. No system is risk-free. Users must keep credentials confidential and report suspected account compromise promptly.",
        ],
      },
      {
        title: "9. Your rights",
        paragraphs: [
          "Subject to the GDPR and any applicable exceptions, you may request access, correction, deletion, restriction, portability or objection. You may withdraw consent where consent is the legal basis and may complain to the Belgian Data Protection Authority or the competent authority where you live or work.",
          "Send a request to the privacy contact shown below. We may need to verify your identity. We will respond within the legally applicable period and explain any refusal or extension.",
        ],
      },
      {
        title: "10. Automated decisions and ranking",
        paragraphs: [
          "Glossed may use rules to match distance, service category, availability, verification status and account safety signals. Unless we explicitly tell you otherwise, those rules do not make a solely automated decision producing legal or similarly significant effects. The main professional-ranking factors are relevance to the requested service and location, availability, verification, reputation and profile completeness.",
        ],
      },
      {
        title: "11. Cookies and local storage",
        paragraphs: [
          "Glossed currently uses only storage needed for authentication, security, interface state and continuity of signup or session flows. It does not currently use advertising cookies. Google Maps and Stripe may set or read their own necessary storage when their features are loaded. If non-essential analytics or advertising tools are introduced, Glossed will add a consent mechanism before using them where required.",
        ],
      },
      {
        title: "12. Changes and contact",
        paragraphs: [
          "Material changes will be identified by a new version and effective date. Where a change requires renewed acknowledgement or consent, Glossed will request it before continued use of the affected feature.",
        ],
      },
    ],
  },
  client_terms: {
    code: "client_terms",
    version: LEGAL_VERSION,
    contentHash: "79d2959e65769db75acc0378bff164faaad80808b8056a3646d04a84e3261963",
    title: "Terms of Use and Booking",
    shortTitle: "Client terms",
    route: "/terms",
    audience: "all",
    acceptanceKind: "contract_acceptance",
    summary: "Rules for accounts, requests, bookings, payments and disputes.",
    sources: [officialSources.consumerRights, officialSources.ecommerce, officialSources.dsa],
    sections: [
      {
        title: "1. Scope and acceptance",
        paragraphs: [
          "These terms govern the Glossed account and marketplace services. They apply to clients and to professionals whenever they use the platform as a client. The version accepted by a user is stored with a server timestamp and is linked to relevant payment operations.",
          "You must be at least 18 and legally able to enter contracts. If you act for an organisation, you confirm that you are authorised to bind it.",
        ],
      },
      {
        title: "2. Platform and contracting parties",
        paragraphs: [
          "Glossed lets clients publish beauty-service requests and lets independent professionals submit offers. Glossed provides the technical marketplace, communication, reservation and payment tools. Glossed does not itself perform the beauty service.",
          "The service contract is between the client and the professional identified in the accepted offer. The professional is responsible for the description, legality, quality, safety and performance of the service. Glossed remains responsible for its own platform obligations and may assist with payment, safety and dispute handling.",
        ],
      },
      {
        title: "3. Accounts and acceptable use",
        bullets: [
          "Provide accurate information, keep it current and protect your sign-in credentials.",
          "Do not impersonate another person, evade a suspension, scrape the service, interfere with security or use Glossed for unlawful, discriminatory, dangerous or fraudulent activity.",
          "Do not move a Glossed-originated booking off-platform to avoid fees, safety controls or payment protections.",
          "Tell us promptly if an account or payment appears compromised.",
        ],
      },
      {
        title: "4. Requests, offers and booking",
        paragraphs: [
          "A client request is an invitation for offers, not a confirmed booking. A professional offer must show the service, scheduled time, professional price, travel amount and other material details. Before payment, Glossed shows the total price and fee information available for that offer.",
          "A booking becomes binding when the client selects an offer, completes the payment step and receives electronic confirmation. If payment fails, expires or is reversed before confirmation, no paid booking is created. The booking record and versioned financial snapshot prevail over informal chat messages about price or time.",
        ],
      },
      {
        title: "5. Prices, fees and payment",
        paragraphs: [
          "The client total consists of the professional's service price, any disclosed travel amount, the disclosed Glossed platform fee and any applicable tax. The current platform fee is calculated and displayed before the order creates an obligation to pay; the technical default is 10% of the professional gross amount unless the checkout summary states another versioned rate.",
          "Payments are processed by Stripe. Glossed may collect the client total and later transfer the professional allocation under the payment flow shown at checkout. Glossed does not store the full card number. A payment may be refused or held where required for security, sanctions, fraud, disputes or legal compliance.",
        ],
      },
      {
        title: "6. Consumer withdrawal information",
        paragraphs: [
          "Where a statutory 14-day withdrawal right applies to a distance service contract, it runs from conclusion of that contract. If the client asks for performance during that period, the client may owe a proportionate amount for service already supplied. The right may be lost after full performance where the legally required prior request and acknowledgement were given.",
          "Glossed will not treat these terms alone as the client's express request to begin a particular service during a withdrawal period. The checkout or booking flow must collect any request or acknowledgement required for that booking. Mandatory consumer rights always prevail.",
        ],
      },
      {
        title: "7. Cancellation, refunds and no-shows",
        paragraphs: [
          "A request can be withdrawn before an offer is paid. After payment, the client can request cancellation through the booking flow. The refund shown for a particular cancellation depends on who cancels, service progress, the displayed cancellation rule, evidence and mandatory consumer law. No undisclosed automatic percentage is imposed by these terms.",
          "If the professional cancels before performance, the client is normally entitled to a full refund of amounts collected for that booking. If the client or professional does not attend, the other party should report the no-show promptly with available evidence. Glossed may freeze payout, seek the other party's response and decide the platform allocation or refund under the displayed policy and applicable law.",
          "Refund timing also depends on Stripe and the client's payment provider. A chargeback does not replace the platform complaint process, and duplicate recovery is not permitted.",
        ],
      },
      {
        title: "8. Completion and 48-hour protection window",
        paragraphs: [
          "After the scheduled service, the professional may mark it complete. The client can confirm completion immediately or report a problem. If the client does neither, the protected payment allocation may become eligible for release 48 hours after the professional's server-recorded completion declaration.",
          "A timely problem report, payment dispute, refund, compliance hold or other configured blocker pauses automatic release while the matter is reviewed. The 48-hour mechanism does not remove statutory rights or prevent a later substantiated claim.",
        ],
      },
      {
        title: "9. Reviews, content and moderation",
        paragraphs: [
          "Reviews must reflect a genuine completed interaction and may not contain threats, hate, private data, fabricated allegations or promotional spam. By posting content, you grant Glossed a non-exclusive, worldwide, royalty-free licence to host, reproduce and display it only as needed to operate, secure and promote the platform.",
          "Glossed may restrict or remove content that violates these terms or the law. Users can report content and challenge a moderation decision through support. Reviews may be preserved as evidence even if no longer public.",
        ],
      },
      {
        title: "10. Suspension and account closure",
        paragraphs: [
          "Glossed may restrict, suspend or close an account for fraud, payment abuse, safety risk, unlawful conduct, repeated cancellations or no-shows, false information, serious or repeated term breaches, or legal and regulatory requirements. Urgent action may be immediate; otherwise Glossed will normally explain the reason and provide an opportunity to respond.",
          "You may close your account, but closure does not cancel existing bookings, payment duties, disputes or records that must be retained. Glossed may preserve limited data as described in the Privacy Notice.",
        ],
      },
      {
        title: "11. Responsibility and liability",
        paragraphs: [
          "Each party is responsible for loss caused by its breach, negligence or unlawful conduct. To the extent permitted by law, Glossed is not responsible for the professional's independent performance or for indirect and unforeseeable loss. Nothing excludes liability that cannot legally be excluded, including mandatory consumer remedies or liability for fraud, wilful misconduct, death or personal injury caused by negligence.",
        ],
      },
      {
        title: "12. Complaints and disputes",
        paragraphs: [
          "Contact Glossed support first with the booking reference and supporting facts. We will acknowledge and review the complaint without undue delay. Consumers may also use a competent recognised alternative-dispute-resolution body, including the Belgian Consumer Mediation Service where it has jurisdiction, or bring a claim before a competent court.",
          "Belgian law governs these terms, without depriving consumers of mandatory protection in their country of habitual residence. Consumers may bring proceedings before any court available under mandatory jurisdiction rules.",
        ],
      },
      {
        title: "13. Changes",
        paragraphs: [
          "A new version applies prospectively from its stated effective date. Existing paid bookings keep the legal and financial snapshot recorded when payment was initiated unless a mandatory rule or a change expressly favourable to the user requires otherwise. Material changes may require renewed acceptance before further booking or payment.",
        ],
      },
    ],
  },
  provider_terms: {
    code: "provider_terms",
    version: LEGAL_VERSION,
    contentHash: "d1c1316214afb0e2fef1ddd210dd68cbb3d9c6a90710b215dadbc687ff3c7cf1",
    title: "Professional Terms",
    shortTitle: "Professional terms",
    route: "/terms/professionals",
    audience: "pro",
    acceptanceKind: "contract_acceptance",
    summary: "Commercial terms for independent beauty professionals using Glossed.",
    sources: [officialSources.p2b, officialSources.dsa],
    sections: [
      {
        title: "1. Scope and professional status",
        paragraphs: [
          "These terms govern the relationship between Glossed and each beauty professional using the platform. They supplement the general Terms of Use. The professional acts independently, on their own account and risk, and is not an employee, worker, partner, franchisee or agent authorised to bind Glossed.",
          "The professional chooses whether to offer a service, the content and price of each offer, working methods and availability, subject to law, safety standards, the accepted booking and these terms.",
        ],
      },
      {
        title: "2. Eligibility and trader traceability",
        bullets: [
          "Provide and maintain accurate identity, address, telephone, email, payment-account, registration and VAT information where applicable.",
          "Complete required verification and eligibility declarations and supply reliable supporting documents. Self-declaration does not itself mean Glossed has approved eligibility.",
          "Offer only services that are lawful, insured where required and within your training, authorisation and professional competence.",
          "Cooperate with proportionate checks against official registers and promptly correct expired or inaccurate information.",
        ],
      },
      {
        title: "3. Listings, ranking and proposals",
        paragraphs: [
          "A proposal must accurately identify the service, date and time, professional price, travel amount, duration and material limitations. It remains subject to acceptance and successful payment. A professional may not use misleading availability, hidden fees or discriminatory conditions.",
          "Discovery and ranking primarily consider service and location relevance, availability, verification, reputation, response and completion history, profile completeness and safety restrictions. Glossed does not currently offer paid ranking. Glossed may adjust weights to improve relevance, safety and marketplace quality.",
        ],
      },
      {
        title: "4. Client relationship and performance",
        paragraphs: [
          "The beauty-service contract is between the professional and the client. The professional is responsible for pre-contract information relating to the service, lawful performance, hygiene, safety, punctuality, professional insurance, licences and any sector-specific duty.",
          "Professional contact data and any legally required trader information must be available to the client before contract conclusion. The professional must respect the confirmed scope and may change price, time or service only through an agreed platform flow.",
        ],
      },
      {
        title: "5. Fees, Stripe Connect and payouts",
        paragraphs: [
          "Glossed applies the fee shown in the proposal and checkout snapshot. The technical default platform fee is 10% of the professional gross amount unless a different versioned rate is expressly displayed before the offer is published or paid. The client total may also include a separately disclosed client fee or tax.",
          "Stripe provides connected-account verification and payout services. The professional must complete Stripe onboarding and keep payment information current. Glossed may collect the client payment, hold the professional allocation during the protection window and instruct a transfer when release conditions are satisfied. Stripe availability, compliance reviews, reserves and banking times may affect payout timing.",
          "The professional authorises Glossed and Stripe to reverse, withhold or offset amounts where a booking is cancelled, refunded, disputed, charged back, duplicated, fraudulent or otherwise not payable, subject to applicable law and the recorded allocation decision.",
        ],
      },
      {
        title: "6. Completion, cancellations and disputes",
        paragraphs: [
          "The professional may declare completion only after the service is eligible to be completed. The client then has a 48-hour protection window to confirm or report a problem before the allocation may be released automatically. False or premature completion declarations are serious breaches.",
          "If the professional cancels before performance, the client is normally entitled to a full refund. A professional no-show, unsafe refusal or materially non-conforming service may lead to refund, withheld payout, account restriction and recovery of amounts already transferred. Client cancellation and partial-performance cases are allocated under the policy shown for the booking and mandatory law; no undisclosed automatic percentage is created by these terms.",
          "The professional must respond promptly and provide relevant evidence when Glossed reviews a cancellation, safety report, service dispute or payment dispute.",
        ],
      },
      {
        title: "7. Taxes, invoices and records",
        paragraphs: [
          "The professional is solely responsible for registration, social-security status, taxes, VAT, invoices and records relating to the beauty service and professional income. Glossed platform statements do not replace professional accounting or tax advice. Glossed may report transaction or trader information where legally required.",
        ],
      },
      {
        title: "8. Client data and confidentiality",
        paragraphs: [
          "Use client data only to manage and perform the relevant booking, meet legal duties or handle a dispute. Do not add clients to marketing lists, sell their data or retain copies longer than needed without a separate lawful basis. Protect addresses, messages and safety information from unauthorised access.",
        ],
      },
      {
        title: "9. Content and intellectual property",
        paragraphs: [
          "The professional keeps ownership of portfolio, profile and brand content. The professional grants Glossed a non-exclusive, worldwide, royalty-free licence to host, format, reproduce and display that content for operation and promotion of the platform until it is removed, subject to reasonable backup and legal-retention periods.",
          "The professional warrants that uploaded content is accurate and does not infringe another person's privacy, image rights or intellectual property.",
        ],
      },
      {
        title: "10. Restriction, suspension and termination",
        paragraphs: [
          "Glossed may restrict listings, payment, payout or account access for incomplete verification, inactive Stripe capabilities, fraud or payment risk, unsafe conduct, unlawful services, false trader information, repeated cancellations or no-shows, manipulation of reviews, off-platform fee avoidance, or serious or repeated breaches.",
          "Where urgent action is not required, Glossed will provide reasons and a reasonable opportunity to respond. Where applicable, termination will be notified on a durable medium with the notice and statement of reasons required by law. The professional may close the account after completing or resolving outstanding bookings, payouts, refunds and disputes.",
        ],
      },
      {
        title: "11. Complaints and mediation",
        paragraphs: [
          "Professionals can submit complaints about technical issues, moderation, ranking, payment, suspension or termination through support. Glossed will review complaints proportionately and communicate an individual outcome. If legally required for the operator's size and status, the current mediator information and complaint-system statistics will be published with these terms before commercial launch.",
        ],
      },
      {
        title: "12. Liability and insurance",
        paragraphs: [
          "The professional indemnifies Glossed against third-party claims caused by the professional's unlawful service, negligence, tax or employment status, content infringement or breach, except to the extent the claim was caused by Glossed. Each party's liability remains subject to mandatory law; no limitation applies to fraud, wilful misconduct or liability that cannot legally be limited.",
          "The professional must maintain insurance appropriate to the services and provide evidence where requested. Glossed does not insure the professional's service activity.",
        ],
      },
      {
        title: "13. Changes and governing law",
        paragraphs: [
          "Glossed will notify professional users of proposed material changes on a durable medium. Where Regulation (EU) 2019/1150 applies, the notice period will be at least 15 days and longer when proportionate, except for legally permitted urgent changes. Continued use after the effective date constitutes acceptance only where the law permits; otherwise express reacceptance will be requested.",
          "Belgian law governs these terms. The competent Belgian courts have jurisdiction, subject to mandatory rules. The parties should first try to resolve a dispute through the internal complaint process and any mediator identified in the final launch version.",
        ],
      },
    ],
  },
});

export const requiredDocumentCodesForRole = (role) =>
  role === "pro"
    ? ["privacy_notice", "client_terms", "provider_terms"]
    : ["privacy_notice", "client_terms"];

export const signupLegalEvidence = (role) =>
  Object.fromEntries(
    requiredDocumentCodesForRole(role).map((code) => [code, legalDocuments[code].version])
  );

export const consumerMediationUrl = officialSources.consumerMediation;
