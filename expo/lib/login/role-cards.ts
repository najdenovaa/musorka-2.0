import type { ComponentType } from "react";
import { User, Wrench } from "lucide-react-native";
import type { UserRole } from "@/types";

export type LoginRoleCardConfig = {
  role: UserRole;
  title: string;
  subtitle: string;
  icon: ComponentType<{ size: number; color: string }>;
  gradient: readonly [string, string, string];
  accentColor: string;
  emoji: string;
};

export const LOGIN_ROLE_CARDS: LoginRoleCardConfig[] = [
  {
    role: "client",
    title: "Пользователь",
    subtitle: "Создавайте заявки и выбирайте лучшего исполнителя",
    icon: User,
    gradient: ["#0E8B56", "#0A6F43", "#085C37"] as const,
    accentColor: "#4ADE80",
    emoji: "🏠" as const,
  },
  {
    role: "executor",
    title: "Исполнитель",
    subtitle: "Получайте заявки по вашим услугам и зарабатывайте",
    icon: Wrench,
    gradient: ["#0C6B8A", "#0A5570", "#084560"] as const,
    accentColor: "#38BDF8",
    emoji: "🔧",
  },
];
