import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { legalDocuments } from "@/legal/legalDocuments";

export default function Legal() {
  return <LegalDocumentPage document={legalDocuments.legal_notice} showOperator />;
}
