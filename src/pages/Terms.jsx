import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { legalDocuments } from "@/legal/legalDocuments";

export default function Terms() {
  return <LegalDocumentPage document={legalDocuments.client_terms} />;
}
