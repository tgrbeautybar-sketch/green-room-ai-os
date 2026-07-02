export const metadata = {
  title: "SMS Terms & Conditions — The Green Room Beauty Bar",
  description: "Terms for The Green Room Beauty Bar's rent-reminder SMS program.",
};

export default function SmsTermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-moss-700">SMS Terms &amp; Conditions</h1>
      <p className="mt-1 text-sm text-muted">The Green Room Beauty Bar · Last updated June 26, 2026</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink">
        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Program Description</h2>
          <p className="mt-2">
            The Green Room Beauty Bar sends rent-payment reminders and account notifications by text message to
            renters who have provided their mobile number and agreed to receive them.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">How You Opt In</h2>
          <p className="mt-2">
            Stylists and wellness providers who rent a chair or room provide their mobile number to The Green Room
            Beauty Bar as part of their rental arrangement and agree to receive rent-related text messages at that
            number. We only message current renters; we never message the general public, and numbers are never
            purchased, sold, or shared.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Message Frequency</h2>
          <p className="mt-2">Message frequency varies; typically 1–2 messages per week around your rent due date.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Cost</h2>
          <p className="mt-2">Message and data rates may apply, depending on your mobile carrier and plan.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Opt Out</h2>
          <p className="mt-2">
            You can cancel at any time by replying <b>STOP</b>. After you reply STOP, we will send one confirmation
            message and you will no longer receive text messages from us.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Help</h2>
          <p className="mt-2">Reply <b>HELP</b> for assistance, or contact us at tgrbeautybar@gmail.com / (978) 308-9540.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Carrier Disclaimer</h2>
          <p className="mt-2">Carriers are not liable for delayed or undelivered messages.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Privacy</h2>
          <p className="mt-2">
            See our <a href="/privacy" className="text-moss-600 underline">Privacy Policy</a> for how we handle your
            information. No mobile information is shared with third parties or affiliates for marketing or promotional purposes.
          </p>
        </section>
      </div>
    </div>
  );
}
