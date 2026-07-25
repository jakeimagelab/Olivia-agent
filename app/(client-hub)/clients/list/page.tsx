"use client";

import { useRouter } from "next/navigation";
import { C } from "@/lib/theme";
import { useClientRoster } from "../_hooks/useClientRoster";
import PcrmClientTable from "../_components/PcrmClientTable";
import NewClientModal from "../_components/NewClientModal";

function SpinBox() {
  return (
    <div style={{ padding: "80px 0", textAlign: "center", color: C.hint }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>불러오는 중...</div>
    </div>
  );
}

export default function ClientRosterPage() {
  const router = useRouter();
  const { filtered, loading, search, setSearch, showModal, setShowModal, deletingId, deleteClient } = useClientRoster();

  return (
    <div style={{ color: C.txt }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 80px" }}>
        {loading ? <SpinBox /> : (
          <PcrmClientTable
            clients={filtered}
            search={search}
            onSearch={setSearch}
            deletingId={deletingId}
            onOpen={(clientId) => router.push(`/clients?id=${clientId}`)}
            onDelete={deleteClient}
            onCreate={() => setShowModal(true)}
          />
        )}
      </div>

      <NewClientModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(id) => { setShowModal(false); router.push(`/clients?id=${id}`); }}
      />
    </div>
  );
}
