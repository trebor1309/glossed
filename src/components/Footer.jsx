import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t mt-12 py-6 text-center text-sm text-gray-600">
      <div className="container mx-auto px-4">
        <p className="mb-2">
          &copy; {new Date().getFullYear()} Glossed. All rights reserved.
        </p>
        <div className="space-x-4">
          <Link to="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link to="/terms" className="hover:underline">
            Terms
          </Link>
          <Link to="/legal" className="hover:underline">
            Legal
          </Link>
          <Link to="/helpcenter" className="hover:underline">
            Help Center
          </Link>
        </div>
      </div>
    </footer>
  );
}
