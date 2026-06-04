# Phase 0 — Completion Report
**Status:** ✅ All 4 tasks complete
**Date:** 2026-05-14
**Next phase:** Phase 1 — Library Installation (awaiting approval)

---

## Task 0.1 — Fix Settings Navigation
**File:** `gnc-frontend/src/Layout.tsx`

**Problem:** The Settings button at the bottom of the sidebar was a plain `<button>` element with no `onClick` or `to` prop — clicking it did nothing despite `S20_SystemSettings.tsx` existing and the `/settings` route being registered in `App.tsx`.

**Fix:** Replaced the `<button>` with a `<NavLink to="/settings">` using the same active-state styling as all other nav items. S20 is now reachable from the sidebar.

**Before:**
```tsx
<button className="flex w-full items-center gap-3 ...">
  <Settings className="w-5 h-5" />
  <span className="font-medium">Settings</span>
</button>
```
**After:**
```tsx
<NavLink to="/settings" className={({ isActive }) => clsx(...)}>
  <Settings className="w-5 h-5" />
  <span className="font-medium">Settings</span>
</NavLink>
```

---

## Task 0.2 — Correct BA Mock Data
**File:** `gnc-frontend/src/store/rocketSlice.ts`

**Problem:** The `initialState` used physically impossible values for the BA Canard rocket — `mass: 42.5 kg` and `length: 1.2 m`, which are off by **10–12×** from the plan §2.2 specification. Any UI element displaying these values would mislead operators.

**Fix:** Updated BA initial data and the library entry to match Plan v5.4 §2.2:

| Field | Before | After | Source |
|-------|--------|-------|--------|
| `id` | `'T-842'` | `'BA'` | Plan §A.4 fixture ID |
| `type` | `'155mm Artillery'` | `'Canard-Controlled Single-Stage'` | Plan §A.4 |
| `mass` | `42.5 kg` | `571.76 kg` | `mass_dry (286.245) + propellant (285.515)` per §2.2 |
| `length` | `1.2 m` | `5.453 m` | `ref_length_m` per §2.2 |
| `diameter` | `0.155 m` | `0.273 m` | `ref_diameter_m` per §2.2 |
| `cgPosition` | `0.65 m` | `2.93 m` | `cg_full_body[0]` approximate §2.2 |
| `cpPosition` | `0.82 m` | `3.15 m` | Estimated from CN/CM tables (CP aft of CG, C7 PASS) |

Also replaced the two placeholder rockets (`T-842` clone and `HL-200`) with the plan's actual test fixture rockets:
- **GH** — Two-Stage / 8-Fin / Mach 15 (§A.4)
- **SA** — Two-Stage / Unpowered Coast Stage 2 (§A.4)

---

## Task 0.3 — Remove Hardcoded Password
**File:** `gnc-frontend/src/S15_LaunchControl.tsx`

**Problem:** `handleArm()` performed `if (password === 'flight')` — a hardcoded plaintext string comparison that any engineer reading the source could exploit. This directly contradicts Plan §1.7 (Keycloak RBAC) and the two-key safety requirement.

**Fix:** Removed the password state variable and hardcoded string entirely. ARM authority is now determined by the operator's **RBAC role** from Redux auth state:

```ts
const canArm = role === 'operator' || role === 'admin';

const handleArm = () => {
  if (!canArm) {
    alert(`ARM denied: role '${role ?? 'none'}' does not have launch authority.`);
    return;
  }
  if (!hardwareKeyPresent) { ... }
  dispatch(armLaunch(true));
};
```

The ARM panel now shows a live credential card displaying the authenticated operator's ID and role, with a green ✓ or red ✗ authority indicator. The button is `disabled` when `canArm === false`.

A note in the UI reads: `"Credential validation: Keycloak OIDC (Phase 6 — pending integration)"` — making the interim state explicit to operators and reviewers.

**Removed imports (lint-clean):** `useState`, `Power`, `Lock` (no longer referenced after the password input was removed).

---

## Task 0.4 — Add `'operator'` Role
**File:** `gnc-frontend/src/store/authSlice.ts`

**Problem:** The `role` union type was `'admin' | 'engineer' | 'viewer' | null` — missing `'operator'`. Plan §1.7 defines 4 RBAC roles: `viewer`, `engineer`, `operator`, `admin`. Without `'operator'` in the type, the Task 0.3 role check would never match the intended role for launch personnel.

**Fix:** Added `'operator'` to the union in both the `AuthState` interface and the `login` action's `PayloadAction` type:

```ts
role: 'admin' | 'engineer' | 'operator' | 'viewer' | null;
```

---

## Files Changed

| File | Change type |
|------|-------------|
| `gnc-frontend/src/Layout.tsx` | Modified — Settings `<button>` → `<NavLink>` |
| `gnc-frontend/src/store/rocketSlice.ts` | Modified — corrected mock data for BA, GH, SA |
| `gnc-frontend/src/S15_LaunchControl.tsx` | Modified — removed hardcoded password; added role-based ARM guard |
| `gnc-frontend/src/store/authSlice.ts` | Modified — added `'operator'` to role union |

---

## Verification Steps

To verify Phase 0 manually before approving Phase 1:

1. **S20 reachable:** Open app → log in → click "Settings" in the bottom sidebar → should load `S20_SystemSettings` screen (currently shows placeholder).
2. **BA data:** Open S3 Rocket Library → BA entry should show `571.76 kg`, `5.453 m`.
3. **ARM role gate (viewer):** Log in as `viewer` role → navigate to `/launch` → ARM panel shows red `✗ Insufficient Role` badge; "Confirm ARM" button is greyed out.
4. **ARM role gate (operator):** Log in as `operator` role → ARM panel shows green `✓ Launch Authority Granted`; button is active.
5. **TypeScript compile:** `npm run build` should complete with no type errors related to `role`.

---

## What Phase 1 Will Do

Phase 1 installs all 12 missing npm libraries required by later screen work. No source-file edits are needed — only `package.json` changes. The install commands are listed in the implementation plan Task 1.1 and 1.2. **Awaiting your approval to proceed.**
