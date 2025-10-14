// 📄 src/main.jsx
import "bootstrap-icons/font/bootstrap-icons.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// ✅ On importe le contexte utilisateur
import { UserProvider } from "./context/UserContext.jsx";

function Root() {
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const openUpgradeModal = () => setShowUpgradeModal(true);
  const closeUpgradeModal = () => setShowUpgradeModal(false);

  return (
    <UserProvider openUpgradeModal={openUpgradeModal}>
      <App
        showUpgradeModal={showUpgradeModal}
        closeUpgradeModal={closeUpgradeModal}
      />
    </UserProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
