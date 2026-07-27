"use client";

import { useRouter } from "next/navigation";
import { C } from "@/lib/theme";
import { useClientRoster } from "../_hooks/useClientRoster";
import PcrmClientTable from "../_components/PcrmClientTable";
import ClientFormModal, { type ClientEditSource } from "../_components/ClientFormModal";
import NewPcrmProjectDialog from "../_components/NewPcrmProjectDialog";

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
  const {
    filtered, loading,
    formModal, openCreate, openEdit, closeForm,
    projectDialogFor, setProjectDialogFor,
    deletingId, deleteClient, load,
  } = useClientRoster();

  return (
    <div style={{ color: C.txt }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 80px" }}>
        {loading ? <SpinBox /> : (
          <PcrmClientTable
            clients={filtered}
            deletingId={deletingId}
            onOpen={(clientId) => router.push(`/clients?id=${clientId}`)}
            onEdit={(client) => openEdit(client as ClientEditSource)}
            onDelete={deleteClient}
            onCreate={openCreate}
            onNewProject={(client) => setProjectDialogFor({ id: client.id, name: client.name })}
          />
        )}
      </div>

      <ClientFormModal
        open={formModal !== null}
        mode={formModal?.mode ?? "create"}
        client={formModal?.client}
        onClose={closeForm}
        onSaved={(id) => { closeForm(); void load(false); router.push(`/clients?id=${id}`); }}
        onSavedAndNewProject={(id) => {
          closeForm();
          void load(false);
          const created = filtered.find((c) => c.id === id);
          setProjectDialogFor({ id, name: created?.name || "" });
        }}
      />
      {projectDialogFor && (
        <NewPcrmProjectDialog
          clientId={projectDialogFor.id}
          clientName={projectDialogFor.name}
          onClose={() => setProjectDialogFor(null)}
          onCreated={(workflowRunId) => {
            setProjectDialogFor(null);
            router.push(`/clients?id=${encodeURIComponent(projectDialogFor.id)}&workflowRunId=${encodeURIComponent(workflowRunId)}`);
          }}
        />
      )}
    </div>
  );
}
