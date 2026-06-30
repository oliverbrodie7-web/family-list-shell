import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export type Member = {
  id: string;
  household_id: string;
  name: string;
  pin_hash: string;
  created_at?: string;
};

const STORAGE_KEY = "shopping_remembered_member_id";

interface MemberContextValue {
  member: Member | null;
  members: Member[];
  loading: boolean;
  refresh: () => Promise<void>;
  rememberMember: (m: Member) => void;
  forgetMember: () => void;
  updateCurrentName: (name: string) => Promise<{ error: string | null }>;
}

const MemberContext = createContext<MemberContextValue | undefined>(undefined);

export function MemberProvider({
  householdId,
  children,
}: {
  householdId: string;
  children: ReactNode;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shopping_members")
      .select("id, household_id, name, pin_hash, created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true });
    const list = (data ?? []) as Member[];
    setMembers(list);
    const rememberedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (rememberedId) {
      const found = list.find((m) => m.id === rememberedId) ?? null;
      setMember(found);
      if (!found) localStorage.removeItem(STORAGE_KEY);
    } else {
      setMember(null);
    }
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rememberMember = (m: Member) => {
    localStorage.setItem(STORAGE_KEY, m.id);
    setMember(m);
    setMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  };

  const forgetMember = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMember(null);
  };

  const updateCurrentName = async (name: string) => {
    if (!member) return { error: "No member" };
    const trimmed = name.trim();
    if (!trimmed) return { error: "Name can't be empty" };
    const { error } = await supabase
      .from("shopping_members")
      .update({ name: trimmed })
      .eq("id", member.id);
    if (error) return { error: error.message };
    setMember({ ...member, name: trimmed });
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, name: trimmed } : m)));
    return { error: null };
  };

  return (
    <MemberContext.Provider
      value={{ member, members, loading, refresh, rememberMember, forgetMember, updateCurrentName }}
    >
      {children}
    </MemberContext.Provider>
  );
}

export function useMember() {
  const ctx = useContext(MemberContext);
  if (!ctx) throw new Error("useMember must be used within MemberProvider");
  return ctx;
}

export function clearRememberedMember() {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
