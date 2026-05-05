/**
 * TanStack Query wrappers для write-side API (Q4 — optimistic strategy).
 *
 * Optimistic для безопасных (assign officer, change status, mark false_positive):
 *   onMutate → snapshot → setQueryData (optimistic)
 *   onError → rollback из snapshot
 *   onSettled → invalidateQueries для refresh
 *
 * Pessimistic для destructive (close case, override critical, regulatory exemption,
 * PEP approval) — реализуются отдельно через ApprovalDialog в Phase E3.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';
import type { BeneficialOwner, Client, ClientStatus, SanctionMatch } from '../../types';

// ─── Update client status (optimistic) ──────────────────────────────────

export const useUpdateClientStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateClientStatus,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['client', vars.clientId] });
      const previous = qc.getQueryData<Client>(['client', vars.clientId]);
      if (previous) {
        qc.setQueryData<Client>(['client', vars.clientId], {
          ...previous,
          status: vars.status as ClientStatus,
        });
      }
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        qc.setQueryData(['client', vars.clientId], context.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['client', vars.clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

// ─── Assign officer (optimistic) ────────────────────────────────────────

export const useAssignOfficer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.assignOfficer,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['client', vars.clientId] });
      const previous = qc.getQueryData<Client>(['client', vars.clientId]);
      if (previous) {
        qc.setQueryData<Client>(['client', vars.clientId], {
          ...previous,
          assignedOfficerId: vars.officerId ?? undefined,
        });
      }
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        qc.setQueryData(['client', vars.clientId], context.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['client', vars.clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

// ─── Resolve sanction match (optimistic для false_positive; pessimistic для true_match — через ApprovalDialog) ──

export const useResolveSanctionMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.resolveSanctionMatch,
    onMutate: async (vars) => {
      // Optimistic только для false_positive (безопасный outcome).
      // true_match — pessimistic, проходит через ApprovalDialog с justification.
      if (vars.resolution !== 'false_positive') return { previous: undefined };
      // Не знаем clientId здесь напрямую — invalidate всех client.sanctions queries.
      // При need-to-know — caller передаёт clientId как additional ctx.
      return { previous: undefined };
    },
    onSettled: (data) => {
      if (data) {
        qc.invalidateQueries({ queryKey: ['client', data.clientId, 'sanctions'] });
      }
      qc.invalidateQueries({ queryKey: ['sanctions'] });
    },
  });
};

// ─── Upsert BV (Phase E2c full implementation) ──────────────────────────

export const useUpsertBv = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.upsertBv,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['client', vars.clientId, 'bvs'] });
      const previous = qc.getQueryData<BeneficialOwner[]>(['client', vars.clientId, 'bvs']);
      if (previous) {
        const next = previous.filter((b) => b.id !== vars.bv.id).concat(vars.bv);
        qc.setQueryData<BeneficialOwner[]>(['client', vars.clientId, 'bvs'], next);
      }
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        qc.setQueryData(['client', vars.clientId, 'bvs'], context.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['client', vars.clientId, 'bvs'] });
    },
  });
};

// (Pessimistic mutations для override/regulatory_exemption/pep_approval/sanction_true_match —
//  Phase E3 через ApprovalDialog с justification; не optimistic.)

export type SanctionResolution = SanctionMatch['status'];
