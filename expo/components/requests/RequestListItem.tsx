import React, { useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import * as Haptics from "expo-haptics";
import { Bookmark, BookmarkCheck } from "lucide-react-native";
import RequestCard from "@/components/RequestCard";
import Colors from "@/constants/colors";
import type { ServiceRequest, UserRole } from "@/types";

export type RequestListItemProps = {
  request: ServiceRequest;
  viewerRole: UserRole | null | undefined;
  isExecutor: boolean;
  isFavorited: boolean;
  onToggleFavorite: (requestId: string) => void;
};

function RequestListItemInner({
  request,
  viewerRole,
  isExecutor,
  isFavorited,
  onToggleFavorite,
}: RequestListItemProps) {
  const handleFavoritePress = useCallback(() => {
    onToggleFavorite(request.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onToggleFavorite, request.id]);

  return (
    <View>
      <RequestCard request={request} viewerRole={viewerRole} />
      {isExecutor && request.status === "new" ? (
        <TouchableOpacity
          style={[styles.favoriteButton, isFavorited && styles.favoriteButtonActive]}
          onPress={handleFavoritePress}
          activeOpacity={0.7}
          testID={`favorite-${request.id}`}
        >
          {isFavorited ? (
            <BookmarkCheck size={16} color={Colors.accent} />
          ) : (
            <Bookmark size={16} color={Colors.textMuted} />
          )}
          <Text style={[styles.favoriteButtonText, isFavorited && styles.favoriteButtonTextActive]}>
            {isFavorited ? "В избранном" : "В избранное"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const RequestListItem = React.memo(RequestListItemInner);

const styles = StyleSheet.create({
  favoriteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginTop: -4,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  favoriteButtonActive: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.25)",
  },
  favoriteButtonText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Colors.textMuted,
  },
  favoriteButtonTextActive: {
    color: Colors.accent,
  },
});
