"use client";

import { useCallback } from "react";

import {
  customerBridgeRatingTargets,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import { useCustomerBridgeMessages } from "./useCustomerBridgeMessages";

export function useCustomerBridgeSideController({
  endpointBase,
  messagesEnabled,
  mobile,
  focusedImageId,
  activeImageIds,
  applyRatingTo,
  toggleColorTo,
  updateNote,
  reviewQuality,
}: {
  endpointBase: string;
  messagesEnabled: boolean;
  mobile: boolean;
  focusedImageId: string | null;
  activeImageIds: ReadonlySet<string>;
  applyRatingTo: (targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => void;
  toggleColorTo: (targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => void;
  updateNote: (imageId: string, value: string) => void;
  reviewQuality: (imageId: string, status: "confirmed_issue" | "confirmed_normal") => Promise<unknown>;
}) {
  const messagesController = useCustomerBridgeMessages({
    endpointBase,
    enabled: messagesEnabled,
    mobile,
    focusedImageId,
  });

  const openMessages = useCallback(() => {
    messagesController.setSideTab("chat");
    messagesController.setMobileSideOpen(true);
  }, [messagesController.setMobileSideOpen, messagesController.setSideTab]);
  const closeMobileSide = useCallback(
    () => messagesController.setMobileSideOpen(false),
    [messagesController.setMobileSideOpen],
  );
  const applyMainRating = useCallback((rating: 0 | CustomerBridgeRating) => {
    applyRatingTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), rating);
  }, [activeImageIds, applyRatingTo, focusedImageId]);
  const applyMainColor = useCallback((colorLabel: CustomerBridgeColorLabel) => {
    toggleColorTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), colorLabel);
  }, [activeImageIds, focusedImageId, toggleColorTo]);
  const handleQualityReview = useCallback((imageId: string, status: "confirmed_issue" | "confirmed_normal") => {
    void reviewQuality(imageId, status);
  }, [reviewQuality]);
  const handleSendMessage = useCallback(() => {
    void messagesController.sendMessage();
  }, [messagesController.sendMessage]);
  const updateFocusedNote = useCallback((value: string) => {
    if (focusedImageId) updateNote(focusedImageId, value);
  }, [focusedImageId, updateNote]);

  return {
    ...messagesController,
    openMessages,
    closeMobileSide,
    applyMainRating,
    applyMainColor,
    handleQualityReview,
    handleSendMessage,
    updateFocusedNote,
  };
}
