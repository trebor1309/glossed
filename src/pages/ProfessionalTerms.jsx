import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { legalDocuments } from "@/legal/legalDocuments";

export default function ProfessionalTerms() {
  return <LegalDocumentPage document={legalDocuments.provider_terms} />;
}
