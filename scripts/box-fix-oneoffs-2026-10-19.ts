/**
 * One-off Box problems triage (2026-10-19).
 * Run: npx tsx scripts/box-fix-oneoffs-2026-10-19.ts
 */
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';
import { auditIncluded } from '../src/services/box/includedAudit';
import { boxAuditId, isLikelyDonation } from '../functions/src/boxAuditLoad';
import type { BoxLineItem } from '../src/types/pilot';

const authenticatedDb = firestoreFromFirebaseCliLogin('grapejuice-pilot');
if (!authenticatedDb) throw new Error('Firebase CLI credentials are unavailable.');
const db = authenticatedDb;

type Line = BoxLineItem & {
  [k: string]: unknown;
};

function scrub(lines: Line[]): Line[] {
  return lines.map((li) => {
    const out = { ...li };
    if (out.displaySectionId === undefined) delete out.displaySectionId;
    return out;
  });
}

function kidKeys(lines: Line[]): string[] {
  return [
    ...new Set(
      lines.flatMap((li) => {
        const m = String(li.slotId).match(/^(?:story|gift)-(.+)$/);
        return m ? [m[1]] : [];
      })
    ),
  ];
}

async function writeAudit(path: string, lines: Line[], adults = 2) {
  const catalog = lines.map((li) => ({ id: li.itemId, name: li.label }));
  const audit = auditIncluded(lines, catalog, { kidKeys: kidKeys(lines), adults });
  const problems = audit.problems;
  const openProblems = problems.filter((p) => !p.grandfathered && !isLikelyDonation(p));
  const id = boxAuditId(path);
  const existing = (await db.collection('boxAudits').doc(id).get()).data() || {};
  await db
    .collection('boxAudits')
    .doc(id)
    .set(
      {
        ...existing,
        path,
        problems,
        open: openProblems.length,
        openSince: openProblems.length ? existing.openSince || new Date().toISOString() : null,
        auditedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  return { openProblems, people: audit.people, problems: audit.problems };
}

async function main() {
  // 1) jessica689 — restore wood dreidel; gelt = allowance only
  {
    const path = 'households/2XjMDQ9zYH4mKpcVO53P/boxDrafts/hanukkah-2026';
    const ref = db.doc(path);
    const data = (await ref.get()).data()!;
    let lines = scrub((data.lineItems || []) as Line[]);
    const kids = kidKeys(lines).length;
    // Prior audit: 2 people → 1 kid + 1 adult
    const adults = Math.max(1, 2 - kids);
    const people = kids + adults;

    lines = lines.filter((li) => !(li.slotId === 'wood-dreidel' && /gelt/i.test(li.itemId)));
    lines = lines.filter(
      (li) =>
        !(
          /gelt/i.test(li.itemId) &&
          (li.unitCents ?? 0) === 0 &&
          li.slotId !== 'gelt-small' &&
          !/^latke|^sufgan|^food/.test(li.slotId)
        )
    );

    const wood = lines.find((li) => li.slotId === 'wood-dreidel');
    if (wood) {
      lines = lines.map((li) =>
        li.slotId === 'wood-dreidel'
          ? {
              ...li,
              itemId: 'classic-wooden-dreidel',
              label: 'Classic Wooden Dreidel',
              quantity: people,
              includedQty: people,
              unitCents: 0,
            }
          : li
      );
    } else {
      lines.push({
        slotId: 'wood-dreidel',
        itemId: 'classic-wooden-dreidel',
        quantity: people,
        includedQty: people,
        unitCents: 0,
        label: 'Classic Wooden Dreidel',
      });
    }

    const gelt = lines.find((li) => li.slotId === 'gelt-small');
    if (gelt) {
      lines = lines.map((li) =>
        li.slotId === 'gelt-small'
          ? {
              ...li,
              itemId: 'little-bag-of-gelt-2-big-5-little',
              label: 'Little Bag of Gelt (2 big, 5 little)',
              quantity: people,
              includedQty: people,
              unitCents: 0,
            }
          : li
      );
    } else {
      lines.push({
        slotId: 'gelt-small',
        itemId: 'little-bag-of-gelt-2-big-5-little',
        quantity: people,
        includedQty: people,
        unitCents: 0,
        label: 'Little Bag of Gelt (2 big, 5 little)',
      });
    }

    lines = scrub(lines);
    await ref.update({
      lineItems: lines,
      updatedAt: new Date().toISOString(),
      _adminFix: '2026-10-19-jessica-gelt',
    });
    const result = await writeAudit(path, lines, adults);
    console.log(
      'jessica',
      { people: result.people, open: result.openProblems.map((p) => p.code) },
      lines
        .filter((l) => /gelt|dreidel|wood/i.test(l.slotId + l.itemId))
        .map((l) => `${l.slotId}:${l.itemId}×${l.quantity}`)
    );
  }

  // 2) myndi — brass paid add-on; restore wood
  {
    const path = 'households/TvHkaVkpqCd1t3uPhJU2/boxDrafts/hanukkah-2026';
    const ref = db.doc(path);
    const data = (await ref.get()).data()!;
    let lines = scrub((data.lineItems || []) as Line[]);
    const geltQty =
      lines.find((li) => /gelt/i.test(li.itemId) && (li.unitCents ?? 0) === 0)?.quantity ?? 2;
    const people = geltQty;

    lines = lines.filter((li) => !/brass/i.test(li.itemId));
    lines.push({
      slotId: 'addon-solid-brass-dreidel',
      itemId: 'solid-brass-dreidel',
      quantity: 1,
      includedQty: 0,
      unitCents: 3000,
      label: 'Solid Brass Dreidel',
    });

    if (!lines.some((li) => li.slotId === 'wood-dreidel')) {
      lines.push({
        slotId: 'wood-dreidel',
        itemId: 'classic-wooden-dreidel',
        quantity: people,
        includedQty: people,
        unitCents: 0,
        label: 'Classic Wooden Dreidel',
      });
    } else {
      lines = lines.map((li) =>
        li.slotId === 'wood-dreidel'
          ? {
              ...li,
              itemId: 'classic-wooden-dreidel',
              label: 'Classic Wooden Dreidel',
              quantity: people,
              includedQty: people,
              unitCents: 0,
            }
          : li
      );
    }

    lines = scrub(lines);
    await ref.update({
      lineItems: lines,
      updatedAt: new Date().toISOString(),
      _adminFix: '2026-10-19-myndi-brass',
    });
    const result = await writeAudit(path, lines);
    console.log(
      'myndi',
      { open: result.openProblems.map((p) => p.code) },
      lines
        .filter((l) => /dreidel|brass|wood/i.test(l.slotId + l.itemId))
        .map((l) => `${l.slotId}:${l.itemId}×${l.quantity}@${l.unitCents}`)
    );
  }

  // 3) rachel.kopely — free gimmel into vacant food slot (exception)
  {
    const path = 'households/PfdGMUpYBepULvwCeZRE/boxDrafts/hanukkah-2026';
    const ref = db.doc(path);
    const data = (await ref.get()).data()!;
    let lines = scrub((data.lineItems || []) as Line[]);

    lines = lines.map((li) =>
      li.slotId === 'decor' && li.itemId === 'gimmel-the-dreidel-stuffie' && (li.unitCents ?? 0) === 0
        ? {
            ...li,
            slotId: 'sufganiyot-mix',
            displaySectionId: 'food',
            unitCents: 0,
            includedQty: 1,
          }
        : li
    );

    lines = scrub(lines);
    await ref.update({
      lineItems: lines,
      updatedAt: new Date().toISOString(),
      _adminFix: '2026-10-19-rachel-gimmel-food',
    });

    // Stuffie isn't a normal food-slot option — approve as exception
    const decisionId = [
      path,
      'food',
      'not-included-item',
      'gimmel-the-dreidel-stuffie',
      '',
    ]
      .join('|')
      .replace(/[/#]/g, '__')
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .slice(0, 700);
    await db
      .collection('boxAuditDecisions')
      .doc(decisionId)
      .set({
        path,
        email: 'rachel.kopely@gmail.com',
        section: 'food',
        code: 'not-included-item',
        itemId: 'gimmel-the-dreidel-stuffie',
        childKey: null,
        detail: '1× gimmel-the-dreidel-stuffie isn\'t an included food-slot option',
        decision: 'approve',
        note: 'Approved: gimmel in food slot (admin 2026-10-19)',
        decidedAt: new Date().toISOString(),
        decidedBy: 'admin-script',
      });

    const result = await writeAudit(path, lines);
    // open count in audit doc doesn't apply decisions — loadBoxProblems does.
    // Stamp approved on the problem in the audit for clarity.
    const stamped: Array<(typeof result.problems)[number] & { approved?: string }> = result.problems.map((p) =>
      p.code === 'not-included-item' && p.itemId === 'gimmel-the-dreidel-stuffie'
        ? { ...p, approved: 'Approved: gimmel in food slot (admin 2026-10-19)' }
        : p
    );
    const openAfter = stamped.filter(
      (p) => !p.grandfathered && !p.approved && !isLikelyDonation(p)
    );
    await db
      .collection('boxAudits')
      .doc(boxAuditId(path))
      .set(
        {
          problems: stamped,
          open: openAfter.length,
          openSince: openAfter.length ? new Date().toISOString() : null,
          auditedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    console.log(
      'rachel',
      { open: openAfter.map((p) => p.code), decisionId },
      lines
        .filter((l) => /sufgan|latke|gimmel|decor|food/i.test(l.slotId + l.itemId))
        .map((l) => `${l.slotId}:${l.itemId}@${l.unitCents}`)
    );
  }

  // 4) guest — clamp sufganiyot to 1
  {
    const path = 'guestSessions/e97cc76bfed946d986adbdca7057bc87';
    const ref = db.doc(path);
    const data = (await ref.get()).data()!;
    const guest = data.snapshot?.guest;
    if (!guest?.lineItems) {
      console.log('guest missing lineItems');
    } else {
      const lines = scrub(
        (guest.lineItems as Line[]).map((li) =>
          li.slotId === 'sufganiyot-mix' && li.itemId === 'sufganiyot-kit'
            ? { ...li, quantity: 1, includedQty: 1, unitCents: 0 }
            : li
        )
      );
      await ref.update({
        'snapshot.guest.lineItems': lines,
        updatedAt: new Date().toISOString(),
        _adminFix: '2026-10-19-guest-sufgan-qty',
      });
      const result = await writeAudit(path, lines);
      console.log(
        'guest',
        { open: result.openProblems.map((p) => `${p.code}:${p.detail}`) },
        lines.find((l) => l.itemId === 'sufganiyot-kit')
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
