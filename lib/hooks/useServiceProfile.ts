"use client";

import { useState, useEffect } from "react";
import { loadProfile } from "@/lib/profile";
import type { ServiceProfile } from "@/lib/types";

export interface UseServiceProfileReturn {
  profile: ServiceProfile | null;
  showModal: boolean;
  showEdit: boolean;
  openEdit: () => void;
  onModalClose: () => void;
  onEditClose: () => void;
}

export function useServiceProfile(): UseServiceProfileReturn {
  const [profile, setProfile]     = useState<ServiceProfile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit]   = useState(false);

  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    if (!p) setShowModal(true);
  }, []);

  function refresh() {
    setProfile(loadProfile());
  }

  return {
    profile,
    showModal,
    showEdit,
    openEdit:     () => setShowEdit(true),
    onModalClose: () => { setShowModal(false); refresh(); },
    onEditClose:  () => { setShowEdit(false);  refresh(); },
  };
}
