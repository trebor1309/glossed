export default function Logo({ size = "text-3xl", variant = "default" }) {
  const gradient =
    variant === "light"
      ? "from-rose-300 to-red-300" // pour fonds foncés
      : "from-rose-600 to-red-600"; // pour fonds clairs

  return (
    <div
      className={`${size} font-extrabold tracking-tight bg-gradient-to-r ${gradient} bg-clip-text text-transparent select-none`}
    >
      Glossed
    </div>
  );
}
