import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProRoute({ children }) {
  const { isPro } = useUser();

  if (!isPro) return <Navigate to="/dashboard" replace />;

  return children;
}
