import { create } from "zustand";

type TabBadgesState = {
  chatTotalUnread: number;
  supportUnread: number;
  notifUnread: number;
  setChatUnread: (chatTotalUnread: number, supportUnread: number) => void;
  setNotifUnread: (notifUnread: number) => void;
};

export const useTabBadgesStore = create<TabBadgesState>((set) => ({
  chatTotalUnread: 0,
  supportUnread: 0,
  notifUnread: 0,
  setChatUnread: (chatTotalUnread, supportUnread) => set({ chatTotalUnread, supportUnread }),
  setNotifUnread: (notifUnread) => set({ notifUnread }),
}));
