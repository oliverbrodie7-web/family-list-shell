import { PlusCircle, ShoppingCart } from "lucide-react";
import { motion } from "framer-motion";
import { snappySpring } from "@/lib/motion";

export type Tab = "input" | "list";

export function TabSwitcher({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div
      className="flex w-full items-center gap-1 rounded-full bg-white p-1.5"
      style={{
        border: "1px solid var(--clay-border)",
        boxShadow: "0 1px 2px rgba(55, 48, 43, 0.05)",
      }}
    >
      <TabBtn
        active={tab === "input"}
        onClick={() => onChange("input")}
        icon={<PlusCircle size={20} strokeWidth={2} />}
        label="Input"
      />
      <TabBtn
        active={tab === "list"}
        onClick={() => onChange("list")}
        icon={<ShoppingCart size={18} strokeWidth={2} />}
        label="List"
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={snappySpring}
      className="flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[14px] font-semibold transition-colors"
      style={{
        background: active ? "var(--clay-accent)" : "transparent",
        color: active ? "#FFFFFF" : "var(--clay-muted)",
      }}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  );
}
