import { Outlet, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function ChatLayout({ leftPanel }) {
  const location = useLocation();
  const isMobile = useIsMobile(768);
  const isChatPage =
    /\/dashboard\/messages\/[^/]+$/.test(location.pathname) ||
    /\/prodashboard\/messages\/[^/]+$/.test(location.pathname);

  return (
    <div className="flex h-[calc(100dvh-5rem)] w-full min-w-0 max-w-full justify-center overflow-hidden md:h-[calc(100vh-3rem)]">
      <div className="flex h-full w-full min-w-0 max-w-5xl overflow-hidden bg-white shadow-sm md:rounded-xl">
        {isMobile ? (
          <div className="flex min-w-0 flex-1 overflow-hidden">
            {isChatPage ? (
              <section className="min-w-0 flex-1 overflow-hidden">
                <Outlet />
              </section>
            ) : (
              <section className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                {leftPanel}
              </section>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <aside className="w-1/3 min-w-[280px] max-w-[380px] shrink-0 overflow-y-auto overflow-x-hidden border-r">
              {leftPanel}
            </aside>
            <section className="min-w-0 flex-1 overflow-hidden">
              <Outlet />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
