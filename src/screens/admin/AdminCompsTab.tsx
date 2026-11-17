import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import type { SemanticColors } from "../../constants/themeMode";
import type { DashInventoryRow } from "../../services/admin/boxesDashboard";
import {
  dashboardCaughtUp,
  shownCompLeft,
  type CompAnchor,
} from "../../services/admin/compStock";

type Styles = {
  section: object;
  caption: object;
  input: object;
  chip: object;
  chipActive: object;
  chipLabel: object;
  td: object;
  tdStrong: object;
  tdMuted: object;
  error: object;
  sectionBody: object;
  tr: object;
};

type CompLine = { itemId: string; label: string; quantity: number };
type CompAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  email: string;
};
type CompPerson = {
  id: string;
  name: string;
  lines: CompLine[];
  address: CompAddress | null;
  orderId: string | null;
  label: "needs-address" | "ready" | "labeled" | "label-failed";
  labelDetail: string | null;
  itemsSet?: boolean;
  handDeliver?: boolean;
  canada?: boolean;
};

const call = httpsCallable<Record<string, unknown>, Record<string, unknown>>(
  functions,
  "adminComplimentaryPlan",
);

const blankAddress = (name: string): CompAddress => ({
  name,
  line1: "",
  line2: "",
  city: "",
  stateProvince: "",
  postalCode: "",
  country: "US",
  email: "",
});

function messageOf(err: unknown): string {
  return err instanceof Error
    ? err.message.replace(/^FirebaseError:\s*/, "")
    : "Something went wrong.";
}

function heldOf(people: CompPerson[], itemId: string): number {
  return people.reduce(
    (n, p) => n + (p.lines.find((l) => l.itemId === itemId)?.quantity ?? 0),
    0,
  );
}

function withQty(
  lines: CompLine[],
  itemId: string,
  label: string,
  quantity: number,
): CompLine[] {
  const rest = lines.filter((l) => l.itemId !== itemId);
  if (quantity <= 0) return rest;
  return [...rest, { itemId, label, quantity }];
}

function floatsDown(person: CompPerson): boolean {
  return (
    Boolean(person.address) ||
    person.itemsSet === true ||
    person.handDeliver === true ||
    person.canada === true
  );
}

/** Inside the set section: plain set, then an address, then hand delivery, then Canada. */
const SETTLE_LABEL = ["Set", "Address in", "Hand deliver", "Canada"] as const;

function settleRank(person: CompPerson): number {
  if (!floatsDown(person)) return -1;
  if (person.canada) return 3;
  if (person.handDeliver) return 2;
  if (person.address) return 1;
  return 0;
}

function personStatus(person: CompPerson): string {
  if (person.handDeliver) return "hand deliver";
  if (person.canada) return "Canada";
  if (person.label === "labeled") return "label created";
  if (person.label === "label-failed") return "label failed";
  if (person.address) return "address in";
  return "needs address";
}

function whoHas(people: CompPerson[], itemId: string): string {
  return people
    .flatMap((p) => {
      const qty = p.lines.find((l) => l.itemId === itemId)?.quantity ?? 0;
      return qty > 0 ? [`${p.name} has ${qty}`] : [];
    })
    .join(", ");
}

/**
 * Name people and assign them items before their addresses are in. Assigning holds the stock.
 * The label is created when the address is saved.
 */
export function AdminCompsTab({
  inventory,
  styles,
  colors,
}: {
  inventory: DashInventoryRow[];
  styles: Styles;
  colors: SemanticColors;
}) {
  const [people, setPeople] = useState<CompPerson[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [address, setAddress] = useState<CompAddress>(blankAddress(""));
  // Live copies left, anchored to the comp quantities at the moment that count was read.
  const [anchor, setAnchor] = useState<Record<string, CompAnchor>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const peopleRef = useRef(people);
  peopleRef.current = people;

  const load = useCallback(async () => {
    const res = await call({ action: "list" });
    const next = (res.data.people as CompPerson[]) ?? [];
    const stock = (res.data.stock as Record<string, number | null>) ?? {};
    peopleRef.current = next;
    setPeople(next);
    const fresh: Record<string, CompAnchor> = {};
    for (const [id, remaining] of Object.entries(stock)) {
      fresh[id] = { remaining, held: heldOf(next, id) };
    }
    setAnchor(fresh);
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(messageOf(err)));
  }, [load]);

  // A dashboard refresh counts the hold only once its figure has dropped to the live one.
  useEffect(() => {
    setAnchor((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of inventory) {
        const a = prev[item.id];
        if (!a || a.remaining == null || item.remaining == null) continue;
        const expected =
          a.remaining - (heldOf(peopleRef.current, item.id) - a.held);
        if (dashboardCaughtUp(item.remaining, expected)) {
          next[item.id] = {
            remaining: item.remaining,
            held: heldOf(peopleRef.current, item.id),
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inventory]);

  const selected = people.find((p) => p.id === selectedId) ?? null;
  useEffect(() => {
    const person = peopleRef.current.find((p) => p.id === selectedId);
    setAddress(person?.address ?? blankAddress(person?.name ?? ""));
  }, [selectedId]);

  const leftOf = (item: DashInventoryRow) =>
    shownCompLeft(item.remaining, heldOf(people, item.id), anchor[item.id]);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory
      .filter((i) => {
        if (q && !i.name.toLowerCase().includes(q)) return false;
        const left = shownCompLeft(
          i.remaining,
          heldOf(people, i.id),
          anchor[i.id],
        );
        const held = heldOf(people, i.id);
        if (onlyInStock && left === 0 && held === 0) return false;
        return i.stock != null || (left ?? 0) > 0 || held > 0;
      })
      .sort((a, b) => {
        const rank = (item: DashInventoryRow) => {
          const left = shownCompLeft(
            item.remaining,
            heldOf(people, item.id),
            anchor[item.id],
          );
          return left == null ? Number.POSITIVE_INFINITY : left;
        };
        const byLeft = rank(b) - rank(a);
        return byLeft || a.name.localeCompare(b.name);
      });
  }, [inventory, query, onlyInStock, people, anchor]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await call(body);
      if (res.data.removed) {
        setSelectedId(null);
        await load();
        return;
      }
      if (res.data.person) {
        const person = res.data.person as CompPerson;
        const next = peopleRef.current.some((p) => p.id === person.id)
          ? peopleRef.current.map((p) => (p.id === person.id ? person : p))
          : [...peopleRef.current, person];
        peopleRef.current = next;
        setPeople(next);
        setSelectedId(person.id);
        const itemId = String(body.itemId ?? "");
        if (
          itemId &&
          (typeof res.data.remaining === "number" ||
            res.data.remaining === null)
        ) {
          setAnchor((prev) => ({
            ...prev,
            [itemId]: {
              remaining: res.data.remaining as number | null,
              held: heldOf(next, itemId),
            },
          }));
        }
      }
    } catch (err) {
      setError(messageOf(err));
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  // Moves the number for every person at once, then confirms it with the server.
  const changeQty = (
    itemId: string,
    label: string,
    quantity: number,
    dashboardRemaining: number | null,
  ) => {
    if (!selected || busy || selected.label === "labeled" || quantity < 0)
      return;
    const prev = peopleRef.current;
    const next = prev.map((p) =>
      p.id === selected.id
        ? { ...p, lines: withQty(p.lines, itemId, label, quantity) }
        : p,
    );
    const before = heldOf(prev, itemId);
    const after = heldOf(next, itemId);
    peopleRef.current = next;
    setPeople(next);
    setAnchor((a) => {
      const base = a[itemId];
      if (base) {
        const remaining =
          base.remaining == null ? null : base.remaining - (after - base.held);
        return { ...a, [itemId]: { remaining, held: after } };
      }
      if (dashboardRemaining == null)
        return { ...a, [itemId]: { remaining: null, held: after } };
      return {
        ...a,
        [itemId]: {
          remaining: dashboardRemaining - (after - before),
          held: after,
        },
      };
    });
    void run({ action: "setItem", personId: selected.id, itemId, quantity });
  };

  const qtyOf = (itemId: string) =>
    selected?.lines.find((l) => l.itemId === itemId)?.quantity ?? 0;

  const orderedPeople = [...people].sort(
    (a, b) => settleRank(a) - settleRank(b),
  );

  const markSet = (done: boolean) => {
    if (!selected || busy) return;
    const next = peopleRef.current.map((p) =>
      p.id === selected.id ? { ...p, itemsSet: done } : p,
    );
    peopleRef.current = next;
    setPeople(next);
    void run({ action: "setDone", personId: selected.id, done });
  };

  const markFulfillment = (patch: {
    handDeliver?: boolean;
    canada?: boolean;
  }) => {
    if (!selected || busy) return;
    const next = peopleRef.current.map((p) =>
      p.id === selected.id ? { ...p, ...patch } : p,
    );
    peopleRef.current = next;
    setPeople(next);
    if (patch.canada === true) setAddress((a) => ({ ...a, country: "CA" }));
    if (patch.canada === false)
      setAddress((a) => ({
        ...a,
        country: a.country === "CA" ? "US" : a.country,
      }));
    void run({ action: "setFulfillment", personId: selected.id, ...patch });
  };

  return (
    <View style={styles.sectionBody}>
      <Text style={styles.caption}>
        Add a person by name and give them items. Each item you assign is held,
        so Available on Inventory drops right away. The ShipStation label is
        created when you save their address, which can wait. Hand delivery and
        Canada never get a label. Anyone with an address, a hand delivery, or
        Canada drops to the bottom.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.brandDark} /> : null}
      <View
        style={{
          flexDirection: "row",
          gap: 24,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <View style={{ width: 360, maxWidth: "100%", gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={colors.textTertiary}
              onSubmitEditing={() => {
                const next = name.trim();
                if (!next) return;
                setName("");
                void run({ action: "add", name: next });
              }}
            />
            <TouchableOpacity
              style={styles.chip}
              onPress={() => {
                const next = name.trim();
                if (!next) return;
                setName("");
                void run({ action: "add", name: next });
              }}
            >
              <Text style={styles.chipLabel}>Add</Text>
            </TouchableOpacity>
          </View>
          {orderedPeople.map((p, index) => {
            const rank = settleRank(p);
            const previous =
              index > 0 ? settleRank(orderedPeople[index - 1]) : -1;
            return (
              <View key={p.id} style={{ gap: 8 }}>
                {rank >= 0 && rank !== previous ? (
                  <Text style={styles.tdMuted}>{SETTLE_LABEL[rank]}</Text>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.chip,
                    p.id === selectedId && styles.chipActive,
                    floatsDown(p) && p.id !== selectedId
                      ? { opacity: 0.55 }
                      : null,
                  ]}
                  onPress={() => setSelectedId(p.id)}
                >
                  <Text style={styles.chipLabel}>
                    {p.name} · {p.lines.reduce((n, l) => n + l.quantity, 0)}{" "}
                    items
                    {` · ${personStatus(p)}`}
                    {p.itemsSet ? " · set" : ""}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {selected ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <View style={[styles.tr, { justifyContent: "space-between" }]}>
                <Text style={styles.tdStrong}>{selected.name}</Text>
                <TouchableOpacity
                  style={styles.chip}
                  disabled={busy}
                  onPress={() => markSet(!selected.itemsSet)}
                >
                  <Text style={styles.chipLabel}>
                    {selected.itemsSet ? "Undo" : "Items are set"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    selected.handDeliver ? styles.chipActive : null,
                  ]}
                  disabled={busy}
                  onPress={() =>
                    markFulfillment({ handDeliver: !selected.handDeliver })
                  }
                >
                  <Text style={styles.chipLabel}>
                    {selected.handDeliver
                      ? "Hand deliver · on"
                      : "Hand deliver"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    selected.canada ? styles.chipActive : null,
                  ]}
                  disabled={busy}
                  onPress={() => markFulfillment({ canada: !selected.canada })}
                >
                  <Text style={styles.chipLabel}>
                    {selected.canada ? "Canada · on" : "Canada, no label"}
                  </Text>
                </TouchableOpacity>
              </View>
              {selected.lines.length === 0 ? (
                <Text style={styles.tdMuted}>
                  Nothing assigned yet. Give items from the list.
                </Text>
              ) : null}
              {selected.lines.map((l) => (
                <View
                  key={l.itemId}
                  style={[styles.tr, { justifyContent: "space-between" }]}
                >
                  <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                    {l.quantity} × {l.label}
                  </Text>
                  {selected.label === "labeled" ? null : (
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <TouchableOpacity
                        style={styles.chip}
                        disabled={busy}
                        onPress={() =>
                          changeQty(
                            l.itemId,
                            l.label,
                            l.quantity - 1,
                            inventory.find((i) => i.id === l.itemId)
                              ?.remaining ?? null,
                          )
                        }
                      >
                        <Text style={styles.chipLabel}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.chip}
                        disabled={
                          busy ||
                          (inventory.find((i) => i.id === l.itemId)
                            ? leftOf(inventory.find((i) => i.id === l.itemId)!)
                            : null) === 0
                        }
                        onPress={() =>
                          changeQty(
                            l.itemId,
                            l.label,
                            l.quantity + 1,
                            inventory.find((i) => i.id === l.itemId)
                              ?.remaining ?? null,
                          )
                        }
                      >
                        <Text style={styles.chipLabel}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
              {selected.label === "labeled" ? (
                <Text style={styles.caption}>
                  Label is in ShipStation. This list is fixed.
                </Text>
              ) : (
                <>
                  {selected.labelDetail ? (
                    <Text style={styles.error}>{selected.labelDetail}</Text>
                  ) : null}
                  {(
                    [
                      "line1",
                      "line2",
                      "city",
                      "stateProvince",
                      "postalCode",
                      "email",
                    ] as const
                  ).map((key) => (
                    <TextInput
                      key={key}
                      style={styles.input}
                      value={address[key]}
                      onChangeText={(v) =>
                        setAddress((a) => ({ ...a, [key]: v }))
                      }
                      placeholder={
                        {
                          line1: "Street",
                          line2: "Apt (optional)",
                          city: "City",
                          stateProvince: "State",
                          postalCode: "Postal code",
                          email: "Email (optional)",
                        }[key]
                      }
                      placeholderTextColor={colors.textTertiary}
                      autoCapitalize="none"
                    />
                  ))}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={styles.chip}
                      onPress={() =>
                        void run({
                          action: "address",
                          personId: selected.id,
                          address: selected.canada
                            ? { ...address, country: "CA" }
                            : address,
                          canada: selected.canada === true,
                          handDeliver: selected.handDeliver === true,
                        })
                      }
                    >
                      <Text style={styles.chipLabel}>
                        {selected.handDeliver ||
                        selected.canada ||
                        address.country === "CA"
                          ? "Save address"
                          : "Save address and create label"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.chip}
                      onPress={() =>
                        void run({ action: "remove", personId: selected.id })
                      }
                    >
                      <Text style={styles.chipLabel}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 280, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search inventory"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.chip, onlyInStock && styles.chipActive]}
              onPress={() => setOnlyInStock((v) => !v)}
            >
              <Text style={styles.chipLabel}>
                {onlyInStock ? "In stock" : "All items"}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.caption}>
            {items.length} items. The number left is what's left for anyone.
            Give adds one to {selected ? selected.name : "the selected person"}.
          </Text>
          {items
            .filter((item, index) => leftOf(item) === 0 || index < 80)
            .map((item) => {
              const left = leftOf(item);
              const taken = whoHas(people, item.id);
              return (
                <View
                  key={item.id}
                  style={[styles.tr, { justifyContent: "space-between" }]}
                >
                  <Text style={[styles.td, { flex: 1 }]} numberOfLines={2}>
                    {item.name}
                    <Text style={styles.tdMuted}>
                      {left == null ? "  · no cap" : `  · ${left} left`}
                    </Text>
                    {taken ? (
                      <Text style={styles.tdStrong}>{`  · ${taken}`}</Text>
                    ) : null}
                  </Text>
                  <TouchableOpacity
                    style={styles.chip}
                    disabled={
                      !selected ||
                      selected.label === "labeled" ||
                      left === 0 ||
                      busy
                    }
                    onPress={() =>
                      changeQty(
                        item.id,
                        item.name,
                        qtyOf(item.id) + 1,
                        item.remaining,
                      )
                    }
                  >
                    <Text style={styles.chipLabel}>Give</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
        </View>
      </View>
    </View>
  );
}
