import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ButtonSpinner, ModalButton } from "../../common";
import AccessStatusBadge from "../password-access/AccessStatusBadge";
import CopyValue from "./CopyValue";
import InlineEmailEdit from "./InlineEmailEdit";
import useNotification from "../../../hooks/useNotification";
import { getAccountAccess } from "../../../services/accountAccessService";
import {
  copyInviteLink,
  issueTemporaryPassword,
  resendInvite,
  updateInviteEmail,
} from "../../../services/accountInviteService";
import {
  approvePasswordResetRequest,
  copyResetLink,
  rejectPasswordResetRequest,
  resendResetLink,
} from "../../../services/passwordResetService";
import { accountAccessBlocks, actionLabel, RESET_CONFIRM } from "../../../utils/accountAccess";
import { copyText } from "../../../utils/clipboard";
import { queryKeys } from "../../../utils/queryKeys";

const BLOCK_TITLES = { invite: "Account invite", reset: "Password reset request" };
const LINK_CLASS = "text-xs font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline";

/**
 * The Access section of Account details: the status of the account's invite and open reset request, and every
 * action on them. Edit email, temporary password, approve and decline open inline panels; nothing stacks a dialog
 * on the modal. All controls are disabled while one action runs.
 */
export default function AccountAccessSection({ account, onChanged }) {
  const notify = useNotification();
  const queryClient = useQueryClient();
  const { data, error: loadError, refetch } = useQuery({
    queryKey: queryKeys.accountAccess(account.id),
    queryFn: () => getAccountAccess(account.id),
    retry: false,
  });

  const [panel, setPanel] = useState(null); // { kind: "invite" | "reset", action }
  const [secret, setSecret] = useState(null); // { kind, type: "password" | "link", value }
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const { message, blocks } = data
    ? accountAccessBlocks({ account, invite: data.invite, resetRequest: data.resetRequest })
    : { message: null, blocks: [] };

  /** Runs one action: ignored while another runs, failures shown in the section (or thrown with `rethrow`). */
  async function run(fn, { rethrow = false } = {}) {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    try {
      return await fn();
    } catch (failure) {
      if (rethrow) throw failure;
      setActionError(failure.message || "This action could not be completed.");
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.accountAccess(account.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminAccount(account.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminAccounts() });
      onChanged?.();
    }
  }

  function announceDelivery(kind, updated) {
    if (updated.delivery === "failed") notify.error("The email could not be sent. Use Copy link to share it another way.");
    else notify.success(`${kind === "invite" ? "Invite" : "Reset link"} sent to ${updated.email}.`);
  }

  async function resend(block) {
    const { kind, row } = block;
    const updated = await run(() => (kind === "invite" ? resendInvite(row.id) : resendResetLink(row.id)));
    if (updated) announceDelivery(kind, updated);
  }

  async function copyLink(block) {
    const { kind, row } = block;
    const url = await run(() => (kind === "invite" ? copyInviteLink(row.id) : copyResetLink(row.id)));
    if (url === undefined) return;
    if (!url) {
      setActionError("Could not create a link. Try again.");
      return;
    }
    if (await copyText(url)) notify.success("Link copied. The emailed link no longer works.");
    else setSecret({ kind, type: "link", value: url });
  }

  async function saveEmail(block, email) {
    const updated = await run(() => updateInviteEmail(block.row.id, email), { rethrow: true });
    if (!updated) return;
    setPanel(null);
    announceDelivery("invite", updated);
  }

  async function issueTemporary(block) {
    const result = await run(() => issueTemporaryPassword(block.row.id));
    setPanel(null);
    if (result?.password) setSecret({ kind: "invite", type: "password", value: result.password });
  }

  async function decide(block, action) {
    const updated = await run(() =>
      action === "approve" ? approvePasswordResetRequest(block.row.id) : rejectPasswordResetRequest(block.row.id),
    );
    setPanel(null);
    if (!updated) return;
    if (action === "approve") announceDelivery("reset", updated);
    else notify.success("Reset request declined.");
  }

  function choose(block, action) {
    if (busy) return;
    setSecret(null);
    if (action === "resend") void resend(block);
    else if (action === "copy") void copyLink(block);
    else setPanel({ kind: block.kind, action });
  }

  return (
    <section className="mt-4 border-t border-slate-100 pt-4" aria-label="Access">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Access</h3>

      {!data && !loadError && <p className="mt-2 text-xs text-slate-500">Loading access...</p>}

      {loadError && !data && (
        <p className="mt-2 text-xs text-red-600">
          Could not load access details.{" "}
          <button type="button" onClick={() => refetch()} className="font-semibold text-red-700 hover:underline">
            Try again
          </button>
        </p>
      )}

      {actionError && <p role="alert" className="mt-2 text-xs text-red-600">{actionError}</p>}

      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}

      {blocks.map((block) => {
        const open = panel?.kind === block.kind ? panel.action : null;
        const shown = secret?.kind === block.kind ? secret : null;
        return (
          <div key={block.kind} className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-[11px] font-semibold text-slate-500">{BLOCK_TITLES[block.kind]}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <AccessStatusBadge {...block.status} />
              <span className="text-sm text-slate-700">{block.status.reason}</span>
            </div>

            {shown?.type === "password" && (
              <div className="mt-3">
                <CopyValue value={shown.value} label="Temporary password" mono />
                <p className="text-xs leading-5 text-slate-600">
                  This is the only time it is shown. It expires in 72 hours. {account.name || "The account holder"} must
                  change it the first time they sign in.
                </p>
              </div>
            )}
            {shown?.type === "link" && (
              <div className="mt-3">
                <CopyValue value={shown.value} label="One-time link" />
                <p className="text-xs leading-5 text-slate-600">
                  The browser could not copy the link. Select it and copy it by hand. The emailed link no longer works.
                </p>
              </div>
            )}

            {open === "editEmail" && (
              <InlineEmailEdit row={block.row} onCancel={() => setPanel(null)} onSave={(email) => saveEmail(block, email)} />
            )}
            {(open === "approve" || open === "decline") && (
              <ConfirmPanel
                title={RESET_CONFIRM[open].title}
                description={RESET_CONFIRM[open].description}
                confirmText={RESET_CONFIRM[open].confirmText}
                busy={busy}
                onCancel={() => setPanel(null)}
                onConfirm={() => decide(block, open)}
              />
            )}
            {open === "temporaryPassword" && (
              <ConfirmPanel
                title="Generate a temporary password?"
                description="Any invite link stops working."
                confirmText="Generate temporary password"
                busy={busy}
                onCancel={() => setPanel(null)}
                onConfirm={() => issueTemporary(block)}
              />
            )}

            {!open && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {block.primary && (
                    <ModalButton variant="primary" disabled={busy} onClick={() => choose(block, block.primary)}>
                      {busy && <ButtonSpinner />}
                      {actionLabel(block.kind, block.primary)}
                    </ModalButton>
                  )}
                  {block.links.map((action) => (
                    <button key={action} type="button" disabled={busy} onClick={() => choose(block, action)} className={LINK_CLASS}>
                      {actionLabel(block.kind, action)}
                    </button>
                  ))}
                </div>

                {block.fallback && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-semibold text-slate-500">Other ways to sign in</p>
                    <button type="button" disabled={busy} onClick={() => choose(block, block.fallback)} className={`mt-1 ${LINK_CLASS}`}>
                      {actionLabel(block.kind, block.fallback)}
                    </button>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      Use only if the email can&apos;t be delivered. This also stops the invite link.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ConfirmPanel({ title, description, confirmText, busy, onCancel, onConfirm }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
      <div className="mt-3 flex justify-end gap-2">
        <ModalButton onClick={onCancel} disabled={busy}>Cancel</ModalButton>
        <ModalButton variant="primary" onClick={onConfirm} disabled={busy}>
          {busy && <ButtonSpinner />}
          {confirmText}
        </ModalButton>
      </div>
    </div>
  );
}
