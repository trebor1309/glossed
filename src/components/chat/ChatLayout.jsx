// 📄 src/components/chat/ChatLayout.jsx
import { Outlet, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function ChatLayout({ leftPanel }) {
  const isMobile = useIsMobile(768);
  const location = useLocation();

  const isChatPage = location.pathname.includes("/chat/");

  return (
    <div className="w-full h-[calc(100vh-6rem)] flex overflow-hidden bg-white">
      {/* --- DESKTOP (split view) --- */}
      {!isMobile && (
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT PANEL (Inbox) */}
          <div className="w-1/3 min-w-[280px] max-w-[380px] border-r overflow-y-auto">
            {leftPanel}
          </div>

          {/* RIGHT PANEL (Chat window) */}
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </div>
      )}

      {/* --- MOBILE (single view) --- */}
      {isMobile && (
        <>
          {!isChatPage ? (
            // Inbox
            <div className="flex-1 overflow-y-auto">{leftPanel}</div>
          ) : (
            // Chat only
            <div className="flex-1 overflow-y-auto">
              <Outlet />
            </div>
          )}
        </>
      )}
    </div>
  );
}
