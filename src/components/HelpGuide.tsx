import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { softSpring, gentleSpring } from "@/lib/motion";
import { useAdvancedFeatures } from "@/lib/advancedFeatures";

// In-app reference guide (basic feature — visible to everyone, no gating).
// Read-only: writes nothing, changes no behaviour. Collapsible sections mirror
// the List tab's aisle cards; Fraunces headings, Figtree body, generous spacing.
export function HelpGuide({ onClose }: { onClose: () => void }) {
  const { isFeatureOn } = useAdvancedFeatures();
  const pricingOn = isFeatureOn("pricing");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
        style={{ background: "var(--clay-bg)", border: "1px solid var(--clay-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--clay-border)" }}
        />

        <h1
          className="font-display text-[24px] leading-tight"
          style={{ color: "var(--clay-ink)" }}
        >
          How to use Our Pantry
        </h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--clay-muted)" }}>
          Tap a section to open it.
        </p>

        <div className="mt-4 flex-1 space-y-2.5 overflow-y-auto">
          <Section title="The basics">
            <p>
              Our Pantry is your family's shared shopping list. Everyone in your
              household sees the same list, and it updates on everyone's phone at
              once.
            </p>
            <p>
              <strong>Adding something:</strong> type it in the box on the{" "}
              <strong>Input</strong> tab and tap the plus. It lands on the{" "}
              <strong>List</strong> tab, already sorted into the right aisle.
            </p>
            <p>
              <strong>Ticking things off:</strong> on the <strong>List</strong>{" "}
              tab, tap the circle next to an item when it goes in your trolley. It
              moves down into the trolley section so you can see what is left.
            </p>
            <p>
              <strong>When you get home:</strong> tap{" "}
              <strong>Clear bought items</strong> to wipe everything you ticked.
              Anything you did not buy stays on the list for next time.
            </p>
          </Section>

          <Section title="Faster ways to add">
            <p>
              <strong>Say your list:</strong> tap the microphone button and just
              talk. Say several things in a row and it will split them up. Handy
              when your hands are full.
            </p>
            <p>
              <strong>Bulk add:</strong> tap <strong>Bulk add</strong> and paste or
              type a whole list at once, one item per line. Good for a big shop.
            </p>
            <p>
              <strong>Regulars:</strong> the chips under the box are things your
              household adds often. Tap one and it goes straight on. The more you
              use the app, the better these get.
            </p>
            <p>
              <strong>The plus on each aisle:</strong> on the{" "}
              <strong>List</strong> tab, each aisle has a plus button. Use it when
              you know something belongs in that aisle.
            </p>
          </Section>

          <Section title="Your list">
            <p>
              <strong>Aisles:</strong> items sort themselves into supermarket
              aisles automatically, so your list matches the order you walk the
              shop. Tap an aisle heading to fold it away.
            </p>
            <p>
              <strong>The star:</strong> tap an item, then the star, to mark it as
              important. Starred items sit at the top of their aisle. Use it for
              the thing you must not forget.
            </p>
            <p>
              <strong>Quantity:</strong> tap an item to set how many you need. It
              shows as a small x2 next to the name.
            </p>
            <p>
              <strong>The coloured dot:</strong> shows who added the item. Handy
              for knowing who to ask when nobody knows what Buldak is.
            </p>
            <p>
              <strong>Changing something:</strong> tap an item's name to rename it
              or move it to a different aisle.
            </p>
            <p>
              <strong>Undo:</strong> delete something by mistake and a small{" "}
              <strong>Undo</strong> appears for a few seconds. Tap it and the item
              comes back.
            </p>
          </Section>

          <Section title="Your family">
            <p>
              Everyone in your household shares one list. Each person picks their
              own profile so the app knows who is adding what.
            </p>
            <p>
              <strong>Adding someone:</strong> go to <strong>Settings</strong> and
              share your invite code. They enter it and they are in.
            </p>
            <p>
              <strong>Notifications:</strong> the app can tell you when someone
              else adds something. Turn this on in <strong>Settings</strong>. You
              will need to allow notifications when your phone asks.
            </p>
          </Section>

          <Section title="Adding the same thing twice">
            <p>
              If you add something already on your list, the app stops it and shows
              a quick message. It is not fussy about spelling: apple, Apples and
              APPLE all count as the same thing.
            </p>
            <p>
              One exception on purpose: if something is already in your trolley and
              you add it again, it goes on the list. The app assumes you need more.
            </p>
          </Section>

          <Section title="Prices and totals (advanced)">
            {!pricingOn && <AdvancedNote />}
            <p>
              Our Pantry can show what things cost and add up your shop before you
              get to the till.
            </p>
            <p>
              <strong>Turning it on:</strong> go to <strong>Settings</strong>,
              switch on <strong>Show advanced features</strong>, then switch on{" "}
              <strong>Prices and totals</strong>.
            </p>
            <p>
              <strong>Where prices come from:</strong> the app looks up your item at
              the supermarket and shows its best guess. A guess looks like ~$4.50,
              with a tilde in front. Guesses are usually close, but sometimes the
              app matches the wrong product, so treat them as a guide.
            </p>
            <p>
              The estimated total at the top of your list adds up everything you
              have not ticked yet. Once you start ticking, a second line shows what
              is already in your trolley.
            </p>
            <p>
              <strong>Setting your own price:</strong> tap any price, type the real
              one and tap <strong>Save</strong>. Your price is now fixed, with no
              tilde, and the app will never overwrite it.
            </p>
            <p>
              <strong>Removing a price:</strong> tap the price and tap{" "}
              <strong>Remove price</strong>. That item stays unpriced and the app
              will not guess at it again.
            </p>
            <p>
              <strong>Your supermarket:</strong> choose it in{" "}
              <strong>Settings</strong>. Woolworths gives automatic prices. Aldi is
              manual only, so you type prices yourself.
            </p>
          </Section>

          <Section title="Pinning the exact product (advanced)">
            {!pricingOn && <AdvancedNote />}
            <p>
              This is the one worth learning. Pinning tells the app exactly which
              product you mean, once, and it remembers forever.
            </p>
            <p>
              <strong>Why bother:</strong> the app guesses. Ask it for milk and it
              might pick a protein shake. Pin it once and it never guesses again.
            </p>
            <p>
              <strong>How to pin:</strong>
            </p>
            <ol className="ml-5 list-decimal space-y-1.5">
              <li>Tap the price on an item.</li>
              <li>
                Tap <strong>Choose exact product</strong>.
              </li>
              <li>Wait a moment while it finds real products with photos.</li>
              <li>Tap the one you actually buy.</li>
            </ol>
            <p>
              That item now shows a solid price with a pin on it, and the price is
              the real price of that exact product.
            </p>
            <p>
              <strong>The best part:</strong> pinning belongs to the item name, not
              to that one row. Pin bread today, and every time anyone in your
              household adds bread from now on, it is priced correctly straight
              away.
            </p>
            <p>
              Nicknames work too. If your list says Mila milk, pin it to whatever
              Mila actually drinks and the app will get it right every time.
            </p>
            <p>
              <strong>Change and Unpin:</strong> tap the price of a pinned item to
              swap it to a different product, or unpin it to go back to guesses.
            </p>
          </Section>

          <Section title="When things go wrong">
            <p>
              <strong>No connection:</strong> a small bar appears at the top saying
              you are offline. While it is there nothing will save. The app will
              tell you honestly if something did not go through rather than
              pretending it worked.
            </p>
            <p>
              <strong>A price looks wrong:</strong> it is a guess. Tap it and either
              type the right price or pin the exact product.
            </p>
            <p>
              <strong>Something is missing from your list:</strong> pull down to
              refresh, and check your connection.
            </p>
          </Section>

          <Section title="Ideas and problems">
            <p>
              Got an idea, or something is annoying you? Tap{" "}
              <strong>Got an idea? Suggest a feature</strong> on the{" "}
              <strong>Input</strong> tab and tell us. It goes straight to Ollie.
            </p>
          </Section>
        </div>

        <button onClick={onClose} className="clay-btn-ghost mt-4">
          Close
        </button>
      </div>
    </div>
  );
}

function AdvancedNote() {
  return (
    <p
      className="rounded-[10px] px-3 py-2 text-[13px]"
      style={{ background: "var(--clay-accent-soft)", color: "var(--clay-accent)" }}
    >
      Turn on Prices and totals in Settings to use this.
    </p>
  );
}

// Collapsible card, collapsed by default — same behaviour/feel as the aisle cards.
function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className="overflow-hidden rounded-[14px] bg-white"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <h2
          className="font-display text-[18px] leading-tight"
          style={{ color: "var(--clay-ink)" }}
        >
          {title}
        </h2>
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={gentleSpring}
          className="flex shrink-0 items-center justify-center"
          style={{ color: "var(--clay-muted)" }}
          aria-hidden
        >
          <ChevronDown size={18} strokeWidth={2.25} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={softSpring}
            style={{ overflow: "hidden" }}
          >
            <div
              className="space-y-3 px-4 pb-4 pt-1 text-[15px] leading-relaxed"
              style={{ color: "var(--clay-ink)" }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
