import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { legalDocuments } from "@/legal/legalDocuments";

export default function Privacy() {
  return <LegalDocumentPage document={legalDocuments.privacy_notice} />;
}
