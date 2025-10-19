import React from "react";
import { createRoot } from "react-dom/client";
import ConfirmModal from "./ConfirmModal";

/**
 * Ouvre le ConfirmModal et renvoie une promesse.
 * @param {string} title - Titre du modal
 * @param {string} message - Message principal
 * @param {object} options - (optionnel) labels & type
 * @returns {Promise<boolean>} - Résolu à true si confirmé, false si annulé
 */
export function openConfirmModal(
  title = "Are you sure?",
  message = "Please confirm this action.",
  options = {}
) {
  return new Promise((resolve) => {
    // Crée un conteneur DOM temporaire
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleClose = () => {
      root.unmount();
      container.remove();
    };

    const handleConfirm = () => {
      resolve(true);
      handleClose();
    };

    const handleCancel = () => {
      resolve(false);
      handleClose();
    };

    root.render(
      <ConfirmModal
        open={true}
        title={title}
        message={message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        confirmLabel={options.confirmLabel || "Confirm"}
        cancelLabel={options.cancelLabel || "Cancel"}
        type={options.type || "default"}
        imagePreview={options.imagePreview}
        previews={options.previews}
      />
    );
  });
}
